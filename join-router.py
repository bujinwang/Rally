#!/usr/bin/env python3
import http.server
import socketserver
import urllib.parse
import re

class JoinHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Parse the URL path
        path = urllib.parse.urlparse(self.path).path
        
        # Check if it's a join link: /join/SHARECODEE
        join_match = re.match(r'^/join/([A-Z0-9]{6})/?$', path, re.IGNORECASE)
        
        if join_match:
            # Serve the join page for any share code
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            
            # Read the join page template
            try:
                with open('join/index.html', 'r') as f:
                    content = f.read()
                self.wfile.write(content.encode('utf-8'))
            except FileNotFoundError:
                self.send_error(404, "Join page template not found")
        else:
            # For all other requests, use default behavior
            super().do_GET()

if __name__ == "__main__":
    PORT = 3000
    
    with socketserver.TCPServer(("", PORT), JoinHandler) as httpd:
        print(f"🌐 Join link server running at http://localhost:{PORT}")
        print(f"📱 Try: http://localhost:{PORT}/join/BWJ2YF")
        httpd.serve_forever()