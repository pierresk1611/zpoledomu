"""Verify the deployed family layout in an isolated browser without editing it."""
import os
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:3000')
KEY = 'zpoledomu.family.v1'
ROWS = [
    ['P014'],
    ['P006', 'P007', 'P008', 'P009', 'P015', 'P016', 'P017'],
    ['P002', 'P003', 'P010', 'P011', 'P012', 'P013', 'P018', 'P019', 'P020', 'P021'],
    ['P001', 'P004', 'P005', 'P022', 'P023', 'P024', 'P025', 'P028', 'P031', 'P032'],
    ['P026', 'P027', 'P029', 'P030', 'P033', 'P034', 'P035'],
]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1920, 'height':1200})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE_URL, wait_until='networkidle')
    before = page.evaluate('key => localStorage.getItem(key)', KEY)
    expect(page.locator('.person-node')).to_have_count(35)
    positions = page.locator('.person-node').evaluate_all('nodes => Object.fromEntries(nodes.map(n => [n.dataset.personId, {x:parseFloat(n.style.left), y:parseFloat(n.style.top)}]))')
    for row in ROWS:
        assert len({positions[pid]['y'] for pid in row}) == 1, row
    assert positions['P002']['x'] - positions['P003']['x'] == 144
    assert positions['P031']['x'] < positions['P001']['x'] < positions['P022']['x']
    expect(page.locator('.couple-frame')).to_have_count(9)
    groups = page.locator('[data-parent-group]').evaluate_all('nodes => nodes.map(n => ({parents:n.dataset.parentGroup.split("|"), children:[...n.querySelectorAll("[data-child-id]")].map(c=>c.dataset.childId)}))')
    parents_of = lambda pid: next(g['parents'] for g in groups if pid in g['children'])
    assert sorted(parents_of('P004')) == ['P002', 'P003']
    assert parents_of('P026') == ['P022']
    assert sorted(parents_of('P031')) == ['P013', 'P021']
    assert sorted(parents_of('P024')) == ['P011', 'P019']
    assert positions['P024']['x'] < positions['P001']['x']
    expect(page.locator('[data-person-id="P026"] strong')).to_have_text('Patrik Okolenský')
    expect(page.locator('[data-person-id="P030"] strong')).to_have_text('Robert Baran')
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
    page.wait_for_timeout(100)
    header_split = page.locator('.tree-lanes span').first.bounding_box()
    graph_split = page.locator('.clan-divider').bounding_box()
    assert abs(header_split['x'] + header_split['width'] - graph_split['x']) < 2
    page.get_by_role('button', name='Celý strom', exact=True).click()
    expect(page.locator('.expanded-tree')).to_be_visible()
    page.set_viewport_size({'width':390, 'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.evaluate('key => localStorage.getItem(key)', KEY) == before
    assert not errors, errors
    print('PASS: shared generation rows, separate clans, adjacent couples, actual parent groups, adoption, expanded view, profile drawer, focus changes, mobile; family data unchanged.')
    raw = json.loads((Path(__file__).resolve().parent.parent / 'src/initial-family.json').read_text())
    update = next(u for u in raw['seedUpdates'] if u['revision'] == 6)
    old = json.loads(json.dumps(raw))
    old['seedRevision'] = 5
    for before_link in update['updateParentage'][0]['ifUnchanged']:
        next(r for r in old['relationships'] if r['id'] == before_link['id']).update(before_link)
    for change in update['updatePeople']:
        next(p for p in old['people'] if p['id'] == change['personId']).update(change['ifUnchanged'])
    for change in update['updateQuestions']:
        next(q for q in old['questions'] if q['id'] == change['questionId']).update(change['ifUnchanged'])
    old['sources'] = [s for s in old['sources'] if s['id'] not in update['sources']]
    old['questions'] = [q for q in old['questions'] if q['id'] not in update['questions']]
    old['people'][0]['note'] = 'Moja vlastná poznámka'
    cached = browser.new_context(viewport={'width':1920, 'height':1200})
    cached.add_init_script('if(!localStorage.getItem('+json.dumps(KEY)+'))localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps(old))+')')
    tab = cached.new_page()
    tab.on('pageerror', lambda e: errors.append(str(e)))
    tab.goto(BASE_URL, wait_until='networkidle')
    saved = tab.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)
    assert saved['seedRevision'] == raw['seedRevision']
    assert sorted(r['from'] for r in saved['relationships'] if r['type']=='parent' and r['to']=='P024') == ['P011', 'P019']
    assert next(p for p in saved['people'] if p['id']=='P001')['note'] == 'Moja vlastná poznámka'
    expect(tab.locator('[data-person-id="P024"].paternal')).to_have_count(1)
    expect(tab.locator('[data-person-id="P026"] strong')).to_have_text('Patrik Okolenský')
    tab.get_by_role('button', name='Celý strom', exact=True).click()
    tab.locator('[data-person-id="P024"]').click()
    expect(tab.locator('.profile h2')).to_have_text('Pavel')
    expect(tab.locator('.details-drawer .relative').filter(has_text='Ružena')).to_be_visible()
    tab.keyboard.press('Escape')
    tab.reload(wait_until='networkidle')
    assert tab.evaluate('key => JSON.parse(localStorage.getItem(key)).relationships.length', KEY) == 55
    assert not errors, errors
    print('PASS: previous saved release migrates to Pavel/Ružena/Pavel and confirmed surnames; own notes survive reload.')
    browser.close()
