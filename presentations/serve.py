"""
Simple HTTP server to view presentations.
Run: python serve.py
Then open: http://localhost:8080/
"""
import http.server
import socketserver
import webbrowser
import os

PORT = 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Prefer dist/ if it exists and has HTML files
html_file = "dist/2025-Budapest-Webtemplates.html"
if os.path.exists(html_file):
    print(f"\n  Open this link in your browser:")
    print(f"  http://localhost:{PORT}/dist/2025-Budapest-Webtemplates.html\n")
else:
    print(f"\n  Open this link in your browser:")
    print(f"  http://localhost:{PORT}/\n")
    print("  (Build first with: npm run build)\n")

Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map.update({".md": "text/markdown"})

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}/")
    print("Press Ctrl+C to stop\n")
    url = f"http://localhost:{PORT}/dist/2025-Budapest-Webtemplates.html" if os.path.exists(html_file) else f"http://localhost:{PORT}/"
    webbrowser.open(url)
    httpd.serve_forever()
