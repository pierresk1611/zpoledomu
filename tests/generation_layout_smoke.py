"""Verify the deployed family layout in an isolated browser without editing it."""
import os
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:3000')
KEY = 'zpoledomu.family.v1'
ROWS = [
    ['P014'],
    ['P006', 'P007', 'P008', 'P009', 'P015', 'P016', 'P017'],
    ['P002', 'P003', 'P010', 'P011', 'P012', 'P013', 'P018', 'P019', 'P020', 'P021'],
    ['P001', 'P004', 'P005', 'P022', 'P023', 'P024', 'P025', 'P028', 'P031'],
    ['P026', 'P027', 'P029', 'P030'],
]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1920, 'height':1200})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE_URL, wait_until='networkidle')
    before = page.evaluate('key => localStorage.getItem(key)', KEY)
    expect(page.locator('.person-node')).to_have_count(31)
    positions = page.locator('.person-node').evaluate_all('nodes => Object.fromEntries(nodes.map(n => [n.dataset.personId, {x:parseFloat(n.style.left), y:parseFloat(n.style.top)}]))')
    for row in ROWS:
        assert len({positions[pid]['y'] for pid in row}) == 1, row
    assert positions['P002']['x'] - positions['P003']['x'] == 144
    assert positions['P031']['x'] < positions['P001']['x'] < positions['P022']['x']
    expect(page.locator('.couple-frame')).to_have_count(8)
    groups = page.locator('[data-parent-group]').evaluate_all('nodes => nodes.map(n => ({parents:n.dataset.parentGroup.split("|"), children:[...n.querySelectorAll("[data-child-id]")].map(c=>c.dataset.childId)}))')
    parents_of = lambda pid: next(g['parents'] for g in groups if pid in g['children'])
    assert sorted(parents_of('P004')) == ['P002', 'P003']
    assert parents_of('P026') == ['P022']
    assert sorted(parents_of('P031')) == ['P013', 'P021']
    expect(page.locator('[data-child-id="P004"].adoptive')).to_have_count(1)
    expect(page.locator('[data-child-id="P005"].adoptive')).to_have_count(1)

    page.get_by_role('button', name='Celý strom', exact=True).click()
    expect(page.locator('.expanded-tree')).to_be_visible()
    page.locator('[data-person-id="P002"]').click()
    expect(page.locator('.details-drawer .profile h2')).to_have_text('Viera Ďurišová')
    page.keyboard.press('Escape')
    expect(page.locator('.details-drawer')).to_be_hidden()
    expect(page.locator('.expanded-tree')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.locator('.expanded-tree')).to_have_count(0)

    for pid in ['P002', 'P003', 'P006', 'P022', 'P026', 'P001']:
        page.get_by_label('Východisková osoba stromu').select_option(pid)
        expect(page.locator(f'.person-node.focused[data-person-id="{pid}"]')).to_have_count(1)
        assert page.locator('.person-node').evaluate_all('nodes => nodes.every(n => Number.isFinite(parseFloat(n.style.left)) && Number.isFinite(parseFloat(n.style.top)))')
    page.set_viewport_size({'width':1280, 'height':800})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.get_by_role('button', name='Celý strom', exact=True).click()
    expect(page.locator('.expanded-tree')).to_be_visible()
    page.set_viewport_size({'width':390, 'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.evaluate('key => localStorage.getItem(key)', KEY) == before
    assert not errors, errors
    print('PASS: shared generation rows, separate clans, adjacent couples, actual parent groups, adoption, expanded view, profile drawer, focus changes, mobile; family data unchanged.')
    browser.close()
