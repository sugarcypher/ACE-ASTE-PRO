"""Write download counts into index.html before Pages deploys it.

Ingress: total npm downloads across its packages, from api.npmjs.org.
Extension: the install total kept by hand in counters.json.
If npm can't be reached, the number already in index.html stays as it is.
"""
import datetime, json, re, urllib.request

cfg = json.load(open("counters.json"))
html = open("index.html", encoding="utf-8").read()

def put(key, n):
    global html
    html, k = re.subn(r'(data-stat="%s">)[^<]*(<)' % key, r"\g<1>{:,}\g<2>".format(n), html)
    print(key, n, "replaced" if k else "MISSING")

put("extension", int(cfg["extension_installs"]))

today = datetime.date.today().isoformat()
total = 0
try:
    for pkg in cfg["npm_packages"]:
        url = "https://api.npmjs.org/downloads/point/%s:%s/%s" % (cfg["npm_start"], today, pkg)
        with urllib.request.urlopen(url, timeout=20) as r:
            total += int(json.load(r)["downloads"])
    put("ingress", total)
except Exception as e:
    print("npm fetch failed, keeping existing number:", e)

open("index.html", "w", encoding="utf-8").write(html)
