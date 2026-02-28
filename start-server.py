#!/usr/bin/env python3
"""
简单的 HTTP 服务器，用于本地测试 OpenClaw Mobile Chat
"""
import http.server
import socketserver
import webbrowser
import os

PORT = 8080

os.chdir(os.path.dirname(os.path.abspath(__file__)))

Handler = http.server.SimpleHTTPRequestHandler

# 添加正确的 MIME 类型
Handler.extensions_map.update({
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
})

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"\n🦞 OpenClaw Mobile Chat 服务器运行中...")
    print(f"📱 本地访问: http://localhost:{PORT}")
    print(f"📱 局域网访问: http://127.0.0.1:{PORT}")
    print(f"\n按 Ctrl+C 停止服务器\n")

    try:
        webbrowser.open(f"http://localhost:{PORT}")
    except:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
