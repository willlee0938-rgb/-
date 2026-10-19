"""Browser integration against a deterministic Supabase API double.

Real PostgreSQL RLS is tested separately in database.test.cjs. These browser tests
do not claim that a hosted Supabase project has been configured or verified.
"""
import base64
import json
import time
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8000/'
HOST = 'https://test-project.supabase.co'
USERS = {
    'a@test.invalid': '11111111-1111-4111-8111-111111111111',
    'b@test.invalid': '22222222-2222-4222-8222-222222222222',
}
remote = {}
failure = {'save': False}
tokens = {}


def token_for(email):
    def encode(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')
    token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({
        'sub': USERS[email], 'exp': int(time.time()) + 3600,
        'iat': int(time.time()), 'aud': 'authenticated', 'role': 'authenticated',
    }) + '.test-signature'
    tokens[token] = email
    return token


def user(email):
    return {'id': USERS[email], 'email': email, 'aud': 'authenticated',
            'role': 'authenticated', 'created_at': '2026-01-01T00:00:00Z',
            'app_metadata': {'provider': 'email', 'providers': ['email']},
            'user_metadata': {}, 'identities': []}


def service(route):
    request = route.request
    parsed = urlparse(request.url)
    query = parse_qs(parsed.query)
    payload = request.post_data_json if request.post_data else {}

    def reply(data=None, status=200):
        route.fulfill(status=status, content_type='application/json', body=json.dumps(data))

    if parsed.path.endswith('/token'):
        email = payload.get('email')
        if email not in USERS or payload.get('password') != 'Testing-only-password':
            return reply({'msg': 'Invalid login credentials'}, 400)
        return reply({'access_token': token_for(email), 'refresh_token': 'test-refresh-' + email,
                      'expires_in': 3600, 'expires_at': int(time.time()) + 3600,
                      'token_type': 'bearer', 'user': user(email)})
    email = tokens.get(request.headers.get('authorization', '').removeprefix('Bearer '))
    if parsed.path.endswith('/logout'):
        return reply({})
    if parsed.path.endswith('/recover'):
        return reply({})
    if parsed.path.endswith('/user'):
        return reply(user(email)) if email else reply({'msg': 'Unauthorized'}, 401)
    if parsed.path != '/rest/v1/driveos_workspaces' or not email:
        return reply({'message': 'Unauthorized'}, 401)
    owner = USERS[email]
    rows = []
    if request.method == 'GET':
        if owner in remote:
            rows = [remote[owner]]
    elif request.method == 'POST':
        assert payload['owner_id'] == owner
        if owner in remote:
            return reply({'code': '23505', 'message': 'duplicate'}, 409)
        remote[owner] = {'version': 1, 'state': payload['state']}
        rows = [remote[owner]]
    elif request.method == 'PATCH':
        if failure['save']:
            return reply({'message': 'test service unavailable'}, 503)
        expected = int(query['version'][0].removeprefix('eq.'))
        if remote[owner]['version'] == expected:
            remote[owner] = {'version': expected + 1, 'state': payload['state']}
            rows = [remote[owner]]
    else:
        raise AssertionError(request.method)
    result = rows[0] if 'vnd.pgrst.object' in request.headers.get('accept', '') and len(rows) == 1 else rows
    reply(result)


def setup(browser):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    # Never send test logins to a real project configured for deployment.
    context.route('**/config.js', lambda route: route.fulfill(
        content_type='application/javascript', body='window.DRIVEOS_CONFIG={};'))
    context.route(HOST + '/**', service)
    connection = json.dumps({'projectUrl': HOST, 'publishableKey': 'sb_publishable_testing_only'})
    context.add_init_script(f"if(!localStorage.getItem('driveos_cloud_connection'))localStorage.setItem('driveos_cloud_connection',{json.dumps(connection)})")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(URL)
    return context, page, errors


def login(page, email):
    assert page.locator('body').evaluate("el=>el.classList.contains('cloud-locked')")
    page.locator('#cloud-login [name=email]').fill(email)
    page.locator('#cloud-login [name=password]').fill('Testing-only-password')
    page.get_by_role('button', name='登入', exact=True).click()
    page.wait_for_function("!document.body.classList.contains('cloud-locked')")


def saved(page):
    page.wait_for_function("document.querySelector('#cloud-status').textContent.includes('已儲存到雲端')")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context_a, page_a, errors_a = setup(browser)
    page_a.locator('#cloud-login [name=email]').fill('a@test.invalid')
    page_a.locator('#cloud-login [name=password]').fill('wrong-password')
    page_a.get_by_role('button', name='登入', exact=True).click()
    page_a.get_by_text('電子郵件或密碼不正確，請重新輸入。', exact=True).wait_for()
    login(page_a, 'a@test.invalid')
    assert page_a.evaluate('db.cars.length') == 0, 'cloud accounts start empty, never with demo or another user data'
    page_a.get_by_role('button', name='⇧　車源匯入', exact=True).click()
    data = [{'externalId': 'K-1', 'brand': 'Toyota', 'model': 'Altis', 'year': 2020,
             'mileageKm': 50000, 'price': 458000, 'status': 'available'}]
    page_a.locator('#inventory-preview [name=file]').set_input_files({
        'name': 'dealer.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode(),
    })
    page_a.get_by_role('button', name='預覽匯入', exact=True).click()
    page_a.get_by_role('button', name='確認寫入車源', exact=True).wait_for()
    assert not remote[USERS['a@test.invalid']]['state']['cars'], 'preview must not write'
    page_a.get_by_role('button', name='確認寫入車源', exact=True).click()
    saved(page_a)
    assert remote[USERS['a@test.invalid']]['state']['cars'][0]['price'] == 458000
    page_a.reload()
    page_a.wait_for_function("!document.body.classList.contains('cloud-locked')")
    assert page_a.evaluate('db.cars.length') == 1
    print('PASS login failure/success, empty cloud account, import preview/commit and cloud reload (API double)')

    other_device, page_other, errors_other = setup(browser)
    login(page_other, 'a@test.invalid')
    assert page_other.evaluate('db.cars[0].price') == 458000
    context_b, page_b, errors_b = setup(browser)
    legacy = {'cars': [{'id': 'LEGACY-B', 'brand': 'Honda', 'model': 'Fit', 'year': 2020,
                        'price': 350000, 'mileage': 30000, 'status': '可售'}],
              'leads': [], 'posts': [], 'deals': []}
    page_b.evaluate('(value)=>localStorage.setItem("driveos_v1",JSON.stringify(value))', legacy)
    login(page_b, 'b@test.invalid')
    assert page_b.evaluate('db.cars.length') == 0
    page_b.get_by_role('button', name='帳號與同步', exact=True).click()
    page_b.get_by_role('button', name='將原本本機資料搬到此帳號', exact=True).click()
    saved(page_b)
    assert remote[USERS['b@test.invalid']]['state']['cars'][0]['id'] == 'LEGACY-B'
    assert remote[USERS['a@test.invalid']]['state']['cars'][0]['externalId'] == 'K-1'
    page_b.get_by_role('button', name='關閉', exact=True).click()
    print('PASS account isolation and second-device load (API double)')
    print('PASS legacy data is migrated only after explicit user confirmation (API double)')

    failure['save'] = True
    page_a.get_by_role('button', name='🚘　車源管理', exact=True).click()
    page_a.get_by_role('button', name='編輯', exact=True).click()
    page_a.locator('[name=price]').fill('430000')
    page_a.get_by_role('button', name='儲存資料', exact=True).click()
    page_a.wait_for_function("document.querySelector('#cloud-status').textContent.includes('雲端儲存失敗')")
    assert remote[USERS['a@test.invalid']]['state']['cars'][0]['price'] == 458000
    page_a.reload()
    page_a.wait_for_function("!document.body.classList.contains('cloud-locked')")
    assert page_a.evaluate('db.cars[0].price') == 430000
    assert '尚未同步的本機草稿' in page_a.locator('#cloud-status').inner_text()
    page_a.get_by_role('button', name='帳號與同步', exact=True).click()
    failure['save'] = False
    page_a.get_by_role('button', name='重試同步', exact=True).click()
    saved(page_a)
    assert remote[USERS['a@test.invalid']]['state']['cars'][0]['price'] == 430000
    page_a.get_by_role('button', name='關閉', exact=True).click()
    print('PASS failed saves retain drafts and explicit retry persists them (API double)')

    page_other.get_by_role('button', name='🚘　車源管理', exact=True).click()
    page_other.get_by_role('button', name='編輯', exact=True).click()
    page_other.locator('[name=price]').fill('410000')
    page_other.get_by_role('button', name='儲存資料', exact=True).click()
    page_other.wait_for_function("document.querySelector('#cloud-status').textContent.includes('另一個裝置有更新')")
    assert remote[USERS['a@test.invalid']]['state']['cars'][0]['price'] == 430000
    page_other.get_by_role('button', name='帳號與同步', exact=True).click()
    page_other.get_by_role('button', name='載入雲端最新版本', exact=True).click()
    saved(page_other)
    assert page_other.evaluate('db.cars[0].price') == 430000
    print('PASS conflicting revisions cannot overwrite newer data; remote reload recovers (API double)')

    page_a.get_by_role('button', name='帳號與同步', exact=True).click()
    page_a.get_by_role('button', name='登出', exact=True).click()
    page_a.locator('#cloud-login').wait_for()
    assert page_a.evaluate('db.cars.length') == 0
    assert not errors_a + errors_other + errors_b, errors_a + errors_other + errors_b
    print('PASS logout hides account data and no JavaScript runtime errors (API double)')
    for context in [context_a, other_device, context_b]:
        context.close()
    browser.close()
