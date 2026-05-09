import sqlite3

conn = sqlite3.connect('d:/Test/trae-solo-unlock/test_mcp.db')
c = conn.cursor()

c.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, age INTEGER)')
c.execute('CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER, product TEXT, amount REAL, order_date TEXT)')

c.execute("INSERT INTO users VALUES (1, 'Alice', 'alice@example.com', 30)")
c.execute("INSERT INTO users VALUES (2, 'Bob', 'bob@example.com', 25)")
c.execute("INSERT INTO users VALUES (3, 'Charlie', 'charlie@example.com', 35)")

c.execute("INSERT INTO orders VALUES (1, 1, 'Laptop', 999.99, '2024-01-15')")
c.execute("INSERT INTO orders VALUES (2, 1, 'Mouse', 29.99, '2024-01-20')")
c.execute("INSERT INTO orders VALUES (3, 2, 'Keyboard', 79.99, '2024-02-01')")
c.execute("INSERT INTO orders VALUES (4, 3, 'Monitor', 399.99, '2024-02-10')")

conn.commit()
conn.close()
print('Test database created successfully')
