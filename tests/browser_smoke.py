"""Functional checks in an isolated browser; no real family data are modified.

Run with a dev server on port 3000: python3 tests/browser_smoke.py
Requires Python Playwright and Chromium (available in this cloud image).
"""
import json
import os
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:3000')
KEY = 'zpoledomu.family.v1'

def person(pid, first, last, birth=''):
    return dict(id=pid, firstName=first, lastName=last, birthDate=birth,
                deathDate='', birthName='', birthPlace='', gender='',
                note='', source='Fiktívny testovací podklad', status='NEOVERENÉ')

fixture = dict(version=1, title='Testovací rodokmeň', questions=[], people=[
    person('test-1', 'Alex', 'Test', '1980'),
    person('test-2', 'Robin', 'Test', '1950'),
    person('test-3', 'Robin', 'Test', '1920'),
], relationships=[
    dict(id='link-1', type='parent', **{'from':'test-2'}, to='test-1', kind='adoptive', status='NEOVERENÉ', source='Test'),
    dict(id='link-2', type='parent', **{'from':'test-3'}, to='test-2', kind='unknown', status='NEOVERENÉ', source='Test')
])

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440, 'height':1000}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE_URL, wait_until='networkidle')
    expect(page.get_by_role('heading', name='Všetko sa začína rodinou.')).to_be_visible()
    expect(page.get_by_text('Uložené v prehliadači', exact=True)).to_be_visible()
    seed = page.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)
    assert isinstance(seed['people'], list)

    page.locator('input[type=file]').set_input_files(dict(name='test.json', mimeType='application/json', buffer=json.dumps(fixture).encode()))
    page.get_by_role('button', name='Nahradiť a importovať').click()
    expect(page.locator('.person-node')).to_have_count(3)
    assert page.locator('.profile h2').inner_text() == 'Alex Test'
    expect(page.get_by_text('Adoptívna väzba', exact=True)).to_be_visible()

    page.get_by_role('button', name='Pridať osobu', exact=True).click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_label('Meno', exact=True).fill('Nová')
    dialog.get_by_label('Priezvisko', exact=True).fill('Osoba')
    dialog.get_by_label('Narodenie', exact=True).fill('2001-02-29')
    dialog.get_by_role('button', name='Uložiť osobu').click()
    expect(dialog.get_by_role('alert')).to_contain_text('Dátum')
    dialog.get_by_label('Narodenie', exact=True).fill('2000-02-29')
    dialog.get_by_role('button', name='Uložiť osobu').click()
    expect(page.locator('.profile h2')).to_have_text('Nová Osoba')
    page.reload(wait_until='networkidle')
    assert len(page.evaluate('key => JSON.parse(localStorage.getItem(key)).people', KEY)) == 4

    page.get_by_role('button', name='Ľudia').click()
    page.get_by_label('Vyhľadať osobu').fill('Robin')
    expect(page.locator('tbody tr')).to_have_count(2)
    page.get_by_label('Vyhľadať osobu').fill('Nová')
    page.locator('.person-cell').click()
    expect(page.locator('.profile h2')).to_have_text('Nová Osoba')
    page.get_by_role('button', name='Pridať rodinnú väzbu').click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_label('Osoba', exact=True).select_option('test-1')
    dialog.get_by_label('Zdroj vzťahu').fill('Testovacia väzba')
    dialog.get_by_role('button', name='Uložiť väzbu').click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    data = page.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)
    assert len(data['relationships']) == 3

    with page.expect_download() as d:
        page.get_by_role('button', name='Exportovať rodokmeň', exact=True).first.click()
    restored = json.loads(open(d.value.path()).read())
    assert len(restored['people']) == 4
    assert restored['relationships'][0]['kind'] == 'adoptive'

    page.get_by_role('button', name='Odstrániť osobu', exact=True).click()
    page.get_by_role('dialog').get_by_role('button', name='Odstrániť osobu', exact=True).click()
    data = page.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)
    assert len(data['people']) == 3 and len(data['relationships']) == 2
    page.locator('input[type=file]').set_input_files(dict(name='invalid.json', mimeType='application/json', buffer=b'{'))
    expect(page.get_by_role('status')).to_contain_text('JSON')
    assert len(page.evaluate('key => JSON.parse(localStorage.getItem(key)).people', KEY)) == 3

    page.get_by_role('button', name='Výskumný denník').click()
    expect(page.get_by_role('heading', name='Po stopách našich predkov.')).to_be_visible()
    page.set_viewport_size({'width':390, 'height':844})
    page.get_by_role('button', name='Otvoriť menu').click()
    page.get_by_role('navigation').get_by_role('button', name='Rodokmeň').click()
    expect(page.get_by_role('heading', name='Všetko sa začína rodinou.')).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.get_by_role('button', name='Pridať osobu', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)

    # Invalid persistent data must never be silently overwritten.
    page.evaluate('(key) => localStorage.setItem(key, "broken-data")', KEY)
    page.reload(wait_until='networkidle')
    expect(page.get_by_role('alert')).to_contain_text('Pôvodný zápis zostáva zachovaný')
    assert page.evaluate('key => localStorage.getItem(key)', KEY) == 'broken-data'
    page.locator('input[type=file]').set_input_files(dict(name='recover.json', mimeType='application/json', buffer=json.dumps(fixture).encode()))
    page.get_by_role('button', name='Nahradiť a importovať').click()
    expect(page.locator('.person-node')).to_have_count(3)
    assert not errors, errors
    print('PASS: rendering, dates, add, persistence, search, relationships, export/import, delete, mobile, corrupt-data recovery; no browser errors.')
    browser.close()
