"""本地 SQLite 测试适配器，不访问网络。创建者：Codex；创建日期：2026/09/28。"""
import json
import sqlite3
import sys

payload = json.load(sys.stdin)
with sqlite3.connect(payload['file']) as connection:
    connection.row_factory = sqlite3.Row
    if payload.get('schema'):
        connection.executescript(payload['schema'])
        result = []
    else:
        cursor = connection.execute(payload['sql'], payload['parameters'])
        result = [dict(row) for row in cursor.fetchall()] if cursor.description else []
    print(json.dumps({'results': result, 'success': True}, ensure_ascii=False))
