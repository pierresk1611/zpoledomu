"""Check the standalone HTML through a plain server, without Vite or an API.

Usage: python3 tests/standalone_smoke.py /path/to/rodokmen.html
The cloud-managed Chromium forbids file: navigation; this checks the same
document through an ephemeral loopback server that serves only the HTML.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import subprocess
import sys
import threading
from playwright.sync_api import sync_playwright, expect

html = Path(sys.argv[1]).read_bytes()
requests = []

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        requests.append(self.path)
        if self.path != '/':
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(html)))
        self.end_headers()
        self.wfile.write(html)

    def log_message(self, *_):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
url = f'http://127.0.0.1:{server.server_port}'
try:
    result = subprocess.run([sys.executable, 'tests/browser_smoke.py'], env={**os.environ, 'TEST_BASE_URL':url})
    if result.returncode:
        raise SystemExit(result.returncode)
    assert not [path for path in requests if path not in ['/', '/favicon.ico']], requests
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        page.goto(url, wait_until='networkidle')
        # Also verify an opaque sandbox like a static preview pane: storage is
        # unavailable, but the embedded data and app must still render.
        page.evaluate("""html => {
            document.body.innerHTML = '';
            const iframe = document.createElement('iframe');
            iframe.setAttribute('sandbox', 'allow-scripts allow-modals');
            iframe.style.width = '100%'; iframe.style.height = '900px';
            iframe.srcdoc = html; document.body.appendChild(iframe);
        }""", html.decode())
        frame = page.frame_locator('iframe')
        expect(frame.get_by_role('heading', name='Všetko sa začína rodinou.')).to_be_visible()
        expect(frame.get_by_role('alert')).to_contain_text('nedajú uložiť')
        frame.get_by_role('button', name='Pridať osobu', exact=True).click()
        dialog = frame.get_by_role('dialog')
        dialog.get_by_label('Meno', exact=True).fill('Sandbox test')
        dialog.get_by_role('button', name='Uložiť osobu').click()
        expect(frame.locator('.profile h2')).to_have_text('Sandbox test')
        browser.close()
    print('PASS: standalone document without assets/API; opaque sandbox renders and supports editing when storage is unavailable.')
finally:
    server.shutdown()
    server.server_close()
