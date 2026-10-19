"""Isolated publishing workflow; all platform links are test evidence, never opened."""
import os
import zipfile
from playwright.sync_api import sync_playwright

URL = os.environ.get('DRIVEOS_TEST_URL', 'http://127.0.0.1:8000/')
PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1EAAAAASUVORK5CYII='

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1100}, accept_downloads=True)
    context.route('**/config.js', lambda route: route.fulfill(content_type='application/javascript', body='window.DRIVEOS_CONFIG={};'))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(URL)
    original = page.evaluate('JSON.stringify(db)')
    assert page.locator('#heading').inner_text() == '審核與發布工作台'
    page.get_by_role('button', name='用五台範例試跑', exact=True).click()
    assert page.get_by_label('發布車源').locator('option').count() == 5
    for checkbox in page.locator('[name=target]').all():
        checkbox.check()
    page.get_by_role('button', name='核准並加入發布清單', exact=True).click()
    assert page.locator('[data-delivery-id]').count() == 2
    assert page.locator('[data-delivery-id] a').count() == 0, 'demo cannot open external platforms'
    with page.expect_download() as download_event:
        page.get_by_role('button', name='② 下載照片與文案 ZIP', exact=True).first.click()
    download = download_event.value
    assert download.suggested_filename.startswith('範例-')
    with zipfile.ZipFile(download.path()) as archive:
        assert len([name for name in archive.namelist() if name.endswith('.svg')]) == 1
        assert '示範' in archive.read('文案.txt').decode('utf-8')
    page.get_by_role('button', name='完成範例試跑', exact=True).first.click()
    assert '範例試跑完成' in page.locator('[data-delivery-id]').first.inner_text()
    assert page.evaluate('JSON.stringify(db)') == original
    page.reload()
    assert page.evaluate('JSON.stringify(db)') == original
    print('PASS five-car demo rehearsal and valid ZIP without real inventory mutations or external publishing')

    page.evaluate("""(png) => {
      const next={cars:[{id:'REAL-QA',brand:'Toyota',model:'Altis',year:2020,mileage:50000,price:450000,status:'可售',images:[{url:png},{url:png}]}],posts:[],leads:[],deals:[],settings:{}};
      DriveOSData.persist(next);DriveOSApp.replaceState(next);
    }""", PNG)
    page.get_by_role('button', name='發布位置', exact=True).click()
    for name, group in [('測試社團 A', '123'), ('測試社團 B', '456')]:
        page.locator('#publication-target [name=name]').fill(name)
        page.locator('#publication-target [name=url]').fill('https://www.facebook.com/groups/' + group + '/')
        page.get_by_role('button', name='加入發布位置', exact=True).click()
    page.get_by_role('button', name='文案與審核', exact=True).click()
    page.get_by_role('button', name='準備這台車的雙平台文案', exact=True).click()
    content = page.get_by_label('待審核廣告文案').input_value() + '\n歡迎先私訊確認賞車時間。'
    page.get_by_label('待審核廣告文案').fill(content)
    page.locator('[name=photo][value="0"]').uncheck()
    for checkbox in page.locator('[name=target]').all():
        checkbox.check()
    page.locator('[name=remindAt]').fill('2099-10-20T12:30')
    page.get_by_role('button', name='核准並加入發布清單', exact=True).click()
    assert page.locator('[data-delivery-id]').count() == 2
    assert page.evaluate('DriveOSPublishing.deliveries(db)[0].task.photoIndexes') == [1]
    assert page.evaluate('DriveOSPublishing.deliveries(db)[0].task.remindAt') == '2099-10-20T04:30:00.000Z'
    assert page.evaluate('DriveOSPublishing.deliveries(db).every(({task})=>task.status==="pending")')
    with page.expect_download() as download_event:
        page.get_by_role('button', name='② 下載照片與文案 ZIP', exact=True).first.click()
    with zipfile.ZipFile(download_event.value.path()) as archive:
        assert len([name for name in archive.namelist() if name.endswith('.png')]) == 1
        assert archive.read('文案.txt').decode('utf-8') == content
    print('PASS destination selection, edited copy, chosen photo, Taipei reminder and usable ZIP')

    page.get_by_role('button', name='④ 記錄貼文網址', exact=True).first.click()
    page.locator('#publication-complete [name=url]').fill('https://facebook.com/groups/456/posts/wrong-group')
    page.get_by_role('button', name='儲存發布紀錄', exact=True).click()
    assert '這個社團內' in page.locator('#publication-error').inner_text()
    page.locator('#publication-complete [name=url]').fill('https://facebook.com/groups/123/posts/test-a')
    page.get_by_role('button', name='儲存發布紀錄', exact=True).click()
    assert page.locator('[data-delivery-id]').filter(has_text='已記錄發布').count() == 1
    page.reload()
    page.get_by_role('button', name='逐站發布（1）', exact=True).click()
    assert page.locator('[data-delivery-id]').count() == 2
    assert page.locator('[data-delivery-id]').filter(has_text='已記錄發布').count() == 1
    page.get_by_role('button', name='🚘　車源管理', exact=True).click()
    page.get_by_role('button', name='編輯', exact=True).click()
    page.locator('[name=price]').fill('420000')
    page.get_by_role('button', name='儲存資料', exact=True).click()
    page.get_by_role('button', name='➤　審核與發布工作台', exact=True).click()
    assert page.locator('[data-delivery-id]').filter(has_text='需重新審核').count() == 1
    assert page.locator('[data-delivery-id]').filter(has_text='已記錄發布').count() == 1
    page.get_by_role('button', name='回到審核', exact=True).click()
    page.get_by_role('button', name='依最新車源重建', exact=True).click()
    assert '420,000' in page.get_by_label('待審核廣告文案').input_value()
    page.get_by_role('button', name='核准並加入發布清單', exact=True).click()
    assert page.locator('[data-delivery-id]').count() == 2
    page.get_by_role('button', name='④ 記錄貼文網址', exact=True).click()
    page.locator('#publication-complete [name=url]').fill('https://facebook.com/groups/456/posts/test-b')
    page.get_by_role('button', name='儲存發布紀錄', exact=True).click()
    assert page.locator('[data-delivery-id]').filter(has_text='已記錄發布').count() == 2
    assert page.evaluate('db.posts.find(post=>post.platform==="Facebook社團").status') == '已發布'
    print('PASS per-group evidence, reload persistence, stale-price blocking, reapproval and preserved history')

    page.set_viewport_size({'width': 390, 'height': 844})
    for title in ['文案與審核', '逐站發布（0）', '發布位置']:
        page.get_by_role('button', name=title, exact=True).click()
        assert page.evaluate('document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth'), title
    page.get_by_role('button', name='文案與審核', exact=True).click()
    page.get_by_role('button', name='用五台範例試跑', exact=True).click()
    page.screenshot(path='/tmp/driveos-publishing-mobile.png', full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1100})
    page.screenshot(path='/tmp/driveos-publishing-desktop.png', full_page=True)
    assert not errors, errors
    print('PASS review, queue and targets mobile layouts, no runtime errors')
    context.close()
    browser.close()
