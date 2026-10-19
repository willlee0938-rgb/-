"""Run against a local static server; uses an isolated, disposable browser context.

Requires Python Playwright and Chromium. No test data is saved to repository files.
"""
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
        headless=True, args=['--no-sandbox'],
    )
    context = browser.new_context(viewport={'width': 1440, 'height': 1100})
    # Exercise demo mode regardless of the public deployment connection config.
    context.route('**/config.js', lambda route: route.fulfill(
        content_type='application/javascript', body='window.DRIVEOS_CONFIG={};'))
    page = context.new_page()
    errors, dialogs = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: (dialogs.append(dialog.message), dialog.accept()))
    response = page.goto(os.environ.get('DRIVEOS_TEST_URL', 'http://127.0.0.1:8000/'))
    assert response.status == 200
    assert page.locator('#heading').inner_text() == '遠端媒合中心'
    assert page.locator('#nav button').count() == 10
    page.get_by_role('button', name='產生待審核草稿', exact=True).click()
    assert page.locator('[data-post-card]').count() == 4
    while page.get_by_role('button', name='核准文案', exact=True).count():
        page.get_by_role('button', name='核准文案', exact=True).first.click()
    assert page.locator('[data-post-card]').count() == 0
    page.locator('#broker-schedule [name=facebook]').fill('測試授權社團')
    page.locator('#broker-schedule [name=threads]').fill('test-account')
    page.get_by_role('button', name='安排已核准文案', exact=True).click()
    page.get_by_role('button', name='發布提醒（4）', exact=True).click()
    assert page.locator('[data-post-card]').count() == 4
    assert page.evaluate("db.posts.filter(p=>p.workflow).every(p=>p.status==='已排程')")
    page.reload()
    assert page.evaluate('db.posts.filter(p=>p.workflow).length') == 4
    print('PASS batch generate, approve, schedule reminders, reload persistence')

    page.get_by_role('button', name='🚘　車源管理', exact=True).click()
    page.locator('.carcard').filter(has_text='Toyota Altis').get_by_role('button', name='編輯', exact=True).click()
    page.locator('[name=price]').fill('320000')
    page.get_by_role('button', name='儲存資料', exact=True).click()
    page.get_by_role('button', name='↗　遠端媒合中心', exact=True).click()
    assert page.evaluate("db.posts.filter(p=>p.workflow&&p.vehicleId==='CAR-001').every(p=>p.status==='待審核'&&!p.scheduledAt)")
    assert page.locator('[data-post-card]').count() == 2
    print('PASS existing inventory editor invalidates stale approvals and reminders')

    page.get_by_role('button', name='建立轉介', exact=True).click()
    page.locator('#broker-refer [name=partnerRep]').fill('車行測試窗口')
    page.locator('#broker-refer [name=commission]').fill('12000')
    page.locator('#broker-refer [name=consent]').check()
    page.get_by_role('button', name='建立轉介紀錄', exact=True).click()
    assert page.get_by_text('轉介紀錄已建立，請複製交接摘要交給車行。', exact=True).count() == 1
    page.get_by_role('button', name='記錄車行回報', exact=True).click()
    page.locator('#broker-outcome [name=status]').select_option('已成交')
    page.locator('#broker-outcome [name=confirmedCommission]').fill('10000')
    page.locator('#broker-outcome [name=paid]').check()
    page.get_by_role('button', name='儲存車行回報', exact=True).click()
    assert page.evaluate('db.deals.find(d=>d.workflow).confirmedCommission') == 10000
    assert 'NT$ 10,000' in page.locator('.broker-shell .grid').inner_text()
    print('PASS referral, consent, sale feedback, expected versus confirmed commission')

    for label in page.locator('#nav button').all_text_contents():
        page.get_by_role('button', name=label, exact=True).click()
        assert page.locator('#app').inner_text().strip()
    page.get_by_role('button', name='▥　數據分析', exact=True).click()
    assert 'NT$ 10,000' in page.locator('#app').inner_text()
    previous = page.evaluate('JSON.stringify(db)')
    page.get_by_role('button', name='✦　廣告範例', exact=True).click()
    assert page.locator('[data-example]').count() == 5
    for index in range(5):
        card = page.locator('[data-example]').nth(index)
        assert '非真實庫存' in card.locator('textarea').input_value()
        facebook = card.locator('textarea').input_value()
        card.get_by_role('button', name='Threads 版', exact=True).click()
        threads = card.locator('textarea').input_value()
        assert threads != facebook and '非真實庫存' in threads
    assert page.evaluate('JSON.stringify(db)') == previous
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth')
    page.set_viewport_size({'width': 1440, 'height': 1100})
    page.goto('http://127.0.0.1:8000/?view=examples')
    assert page.locator('#heading').inner_text() == '廣告範例'
    assert page.locator('[data-example]').count() == 5
    assert page.evaluate('JSON.stringify(db)') == previous
    page.screenshot(path='/tmp/driveos-ad-examples.png', full_page=True)
    print('PASS five ad examples, both platforms, direct link, mobile layout, and no workspace data changes')
    page.get_by_role('button', name='↗　遠端媒合中心', exact=True).click()
    page.screenshot(path='/tmp/driveos-broker-desktop.png', full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth')
    page.screenshot(path='/tmp/driveos-broker-mobile.png', full_page=True)
    assert not errors, errors
    assert not dialogs, dialogs
    print('PASS all 10 pages, confirmed commission analytics, mobile layout and no runtime errors')
    context.close()
    browser.close()
