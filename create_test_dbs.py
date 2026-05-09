import sqlite3
import os

os.makedirs('D:/db-test-data', exist_ok=True)

conn = sqlite3.connect('D:/db-test-data/app.db')
c = conn.cursor()
c.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, age INTEGER, city TEXT)')
c.execute('CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER, product TEXT, amount REAL, order_date TEXT, status TEXT)')
c.execute('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT, description TEXT)')

users_data = [
    (1, 'Alice', 'alice@example.com', 30, 'Beijing'),
    (2, 'Bob', 'bob@example.com', 25, 'Shanghai'),
    (3, 'Charlie', 'charlie@example.com', 35, 'Guangzhou'),
    (4, 'Diana', 'diana@example.com', 28, 'Shenzhen'),
    (5, 'Eve', 'eve@example.com', None, 'Beijing'),
]
orders_data = [
    (1, 1, 'Laptop', 999.99, '2024-01-15', 'completed'),
    (2, 1, 'Mouse', 29.99, '2024-01-20', 'completed'),
    (3, 2, 'Keyboard', 79.99, '2024-02-01', 'completed'),
    (4, 3, 'Monitor', 399.99, '2024-02-10', 'pending'),
    (5, 2, 'Headphones', 149.99, '2024-02-15', 'completed'),
    (6, 4, 'USB Cable', 12.99, '2024-03-01', 'completed'),
    (7, 5, 'Webcam', 89.99, '2024-03-05', 'cancelled'),
    (8, 1, 'SSD Drive', 199.99, '2024-03-10', 'completed'),
]
categories_data = [
    (1, 'Electronics', 'Electronic devices and accessories'),
    (2, 'Peripherals', 'Input and output devices'),
    (3, 'Storage', 'Data storage solutions'),
]

c.executemany('INSERT OR REPLACE INTO users VALUES (?,?,?,?,?)', users_data)
c.executemany('INSERT OR REPLACE INTO orders VALUES (?,?,?,?,?,?)', orders_data)
c.executemany('INSERT OR REPLACE INTO categories VALUES (?,?,?)', categories_data)
conn.commit()
conn.close()

conn2 = sqlite3.connect('D:/db-test-data/sales.db')
c2 = conn2.cursor()
c2.execute('CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, customer TEXT, product TEXT, amount REAL, order_date TEXT)')
orders = [
    (1, 'Company A', 'Server License', 2500.00, '2024-01-05'),
    (2, 'Company B', 'Support Package', 450.00, '2024-01-12'),
    (3, 'Company A', 'Cloud Storage', 120.00, '2024-02-01'),
    (4, 'Company C', 'Server License', 2500.00, '2024-02-15'),
    (5, 'Company B', 'API Access', 75.00, '2024-03-01'),
    (6, 'Company D', 'Consulting', 5000.00, '2024-03-10'),
    (7, 'Company A', 'Support Package', 450.00, '2024-03-15'),
    (8, 'Company E', 'Training', 800.00, '2024-04-01'),
]
c2.executemany('INSERT OR REPLACE INTO orders VALUES (?,?,?,?,?)', orders)
conn2.commit()
conn2.close()

conn3 = sqlite3.connect('D:/db-test-data/analytics.sqlite3')
c3 = conn3.cursor()
c3.execute('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, event_type TEXT, user_id INTEGER, timestamp TEXT, properties TEXT)')
c3.execute('CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, user_id INTEGER, start_time TEXT, end_time TEXT, page_count INTEGER, device TEXT)')
c3.execute('CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY, url TEXT, title TEXT, category TEXT, avg_load_time REAL)')

events = [
    (1, 'click', 101, '2024-01-15T10:30:00', '{"button":"signup"}'),
    (2, 'pageview', 101, '2024-01-15T10:31:00', '{"page":"/home"}'),
    (3, 'click', 102, '2024-01-15T11:00:00', '{"button":"buy"}'),
    (4, 'pageview', 103, '2024-01-15T11:30:00', '{"page":"/products"}'),
    (5, 'click', 101, '2024-01-16T09:00:00', '{"button":"cart"}'),
    (6, 'error', 104, '2024-01-16T10:00:00', '{"code":"404","path":"/old-page"}'),
    (7, 'pageview', 102, '2024-01-16T10:30:00', '{"page":"/checkout"}'),
    (8, 'click', 105, '2024-01-16T11:00:00', '{"button":"subscribe"}'),
    (9, 'error', 103, '2024-01-17T08:00:00', '{"code":"500","path":"/api/data"}'),
    (10, 'pageview', 101, '2024-01-17T09:00:00', '{"page":"/dashboard"}'),
]
sessions = [
    (1, 101, '2024-01-15T10:30:00', '2024-01-15T11:15:00', 5, 'desktop'),
    (2, 102, '2024-01-15T11:00:00', '2024-01-15T11:45:00', 3, 'mobile'),
    (3, 103, '2024-01-15T11:30:00', '2024-01-15T12:00:00', 2, 'desktop'),
    (4, 101, '2024-01-16T09:00:00', '2024-01-16T10:30:00', 8, 'desktop'),
    (5, 104, '2024-01-16T10:00:00', '2024-01-16T10:05:00', 1, 'mobile'),
    (6, 105, '2024-01-16T11:00:00', '2024-01-16T11:30:00', 4, 'tablet'),
]
pages = [
    (1, '/home', 'Homepage', 'main', 0.5),
    (2, '/products', 'Products', 'catalog', 1.2),
    (3, '/checkout', 'Checkout', 'transaction', 0.8),
    (4, '/dashboard', 'Dashboard', 'app', 1.5),
    (5, '/api/data', 'API Data', 'api', 2.3),
]

c3.executemany('INSERT OR REPLACE INTO events VALUES (?,?,?,?,?)', events)
c3.executemany('INSERT OR REPLACE INTO sessions VALUES (?,?,?,?,?,?)', sessions)
c3.executemany('INSERT OR REPLACE INTO pages VALUES (?,?,?,?,?)', pages)
conn3.commit()
conn3.close()

print('All test databases created successfully:')
print('  D:/db-test-data/app.db (3 tables: users, orders, categories)')
print('  D:/db-test-data/sales.db (1 table: orders)')
print('  D:/db-test-data/analytics.sqlite3 (3 tables: events, sessions, pages)')
