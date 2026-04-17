from http.server import HTTPServer, SimpleHTTPRequestHandler
import os

os.chdir('/root/.openclaw/media/tool-image-generation/')

class CORSHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Cache-Control', 'public, max-age=86400')
        super().end_headers()

print('CORS media server starting on port 8003...')
HTTPServer(('0.0.0.0', 8003), CORSHandler).serve_forever()
