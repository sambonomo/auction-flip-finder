# Builds the standalone site from the app source (same file that is published as the Claude page).
import sys
src=open(sys.argv[1],encoding='utf-8').read()  # usage: python3 build.py <app source html>
head='''<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#ffffff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Flip Finder">
<link rel="icon" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon.svg">
<link rel="manifest" href="/manifest.webmanifest">
'''
a='<title>Auction Flip Finder</title>\n'
assert src.count(a)==1
out=src.replace(a,a+head)
# The sign-out link and the shared-data row are in the source, marked data-site, and the page shows them only on the website.
assert out.count('href="/api/logout"')==2
open('public/index.html','w',encoding='utf-8').write(out)
print('built',len(out))
