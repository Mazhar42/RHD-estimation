from app import main

print('App imported successfully')
print('Routes registered:')
auth_routes = []
for route in main.app.routes:
    path = getattr(route, 'path', 'N/A')
    methods = getattr(route, 'methods', 'N/A')
    print(f'  {path} - {methods}')
    if '/auth' in str(path):
        auth_routes.append(path)

print(f'\nTotal auth routes found: {len(auth_routes)}')
print('Auth routes:', auth_routes)
