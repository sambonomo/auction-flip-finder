# Builds the standalone site from the app source (same file that is published as the Claude page).
import sys,re
src=open(sys.argv[1],encoding='utf-8').read()  # usage: python3 build.py <app source html>
icon="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23f5a524'/%3E%3Ctext x='32' y='45' font-size='38' font-weight='800' text-anchor='middle' font-family='Arial' fill='%231a1300'%3E$%3C/text%3E%3C/svg%3E"
head='''<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#ffffff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Flip Finder">
<link rel="icon" href="%s">
<link rel="manifest" href="/manifest.webmanifest">
''' % icon
a='<title>Auction Flip Finder</title>\n'
assert src.count(a)==1
out=src.replace(a,a+head)
# Site only: a sign-out link in the header.
b='<div class="sync" id="sync"><i></i><span>This device</span></div>'
assert out.count(b)==1
out=out.replace(b,b+'<a href="/api/logout" style="font-size:13px;font-weight:600;color:var(--muted);white-space:nowrap;text-decoration:none;padding:0 4px">Sign out</a>')
open('public/index.html','w',encoding='utf-8').write(out)
print('built',len(out))
