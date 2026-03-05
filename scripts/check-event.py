import urllib.request, os

env = {}
with open('.env.local', 'r') as f:
    for line in f:
        if "=" in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1)
            env[k] = v

host = env['VITE_SUPABASE_URL']
key = env['SUPABASE_SERVICE_ROLE_KEY']

req = urllib.request.Request(f'{host}/rest/v1/events?id=eq.d4163530-f5e1-4556-b27b-bc60e35562e7&select=title,starts_at,venue,image_url', headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Accept': 'application/vnd.pgrst.object+json'})
try:
  res = urllib.request.urlopen(req)
  print('EVENT:', res.read().decode())
except urllib.error.HTTPError as e:
  print('ERROR:', e.read().decode())
except Exception as e:
  print('ERROR:', str(e))
