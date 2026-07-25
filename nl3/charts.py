import json, urllib.parse

def qc(cfg, w, h):
    return ("https://quickchart.io/chart?bkg=%23F7F5F0&v=4&w={}&h={}&c=".format(w,h)) + urllib.parse.quote(json.dumps(cfg, separators=(',',':')), safe='')

# Chart A: model vs Mireia
a = {
 "type":"bar",
 "data":{"labels":["Cartera model","La cartera de la Mireia"],
   "datasets":[{"data":[69.53,104.82],"backgroundColor":["#B4B0A6","#C8A54A"],"borderRadius":6,"barPercentage":0.62}]},
 "options":{"indexAxis":"y","layout":{"padding":{"right":14}},
   "plugins":{"legend":{"display":False},"title":{"display":True,"text":"Rendibilitat acumulada  ·  març 2021 – juliol 2026","color":"#16233A","font":{"size":13}}},
   "scales":{"x":{"suggestedMax":120,"ticks":{"callback":"__CB__","color":"#6B685F","font":{"size":12}},"grid":{"color":"#E9E6DF"}},
             "y":{"ticks":{"color":"#16233A","font":{"size":13}},"grid":{"display":False}}}}}
ua = qc(a, 520, 230).replace(urllib.parse.quote('"__CB__"', safe=''), urllib.parse.quote("function(v){return '+'+v+'%'}", safe=''))

# Chart B: participacions per 100 EUR
b = {
 "type":"bar",
 "data":{"labels":["Mercat a màxims","Mercat −15%","Mercat −30%"],
   "datasets":[{"data":[1.00,1.18,1.43],"backgroundColor":["#B4B0A6","#C8A54A","#16233A"],"borderRadius":6,"barPercentage":0.55}]},
 "options":{"layout":{"padding":{"top":6}},
   "plugins":{"legend":{"display":False},"title":{"display":True,"text":"Participacions que compres amb els mateixos 100 €","color":"#16233A","font":{"size":13}}},
   "scales":{"y":{"suggestedMax":1.6,"ticks":{"color":"#6B685F","font":{"size":12}},"grid":{"color":"#E9E6DF"}},
             "x":{"ticks":{"color":"#16233A","font":{"size":12}},"grid":{"display":False}}}}}
ub = qc(b, 520, 250)

open('/sessions/focused-youthful-meitner/mnt/outputs/nl3/urls.txt','w').write(ua+"\n@@@\n"+ub+"\n")
print("A len", len(ua)); print("B len", len(ub))
