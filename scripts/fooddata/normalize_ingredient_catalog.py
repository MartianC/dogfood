#!/usr/bin/env python3
"""整理 USDA 机器译名，并合并仅烹饪/保存状态不同的标准食材。"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


CONTRACT = "ingredientCatalogNameNormalization/v1"
CURATION_REVIEW_CONTRACT = "ingredientCatalogCurationReview/v1"

# 这些条目是审核页中已经确认的机器直译案例。键使用 USDA 英文描述，
# 避免依赖某一版机器译文，且保留原始译名作为 alias 方便历史菜谱检索。
EXACT_NAMES: dict[str, str] = {
    "Beans, baked, canned, plain or vegetarian": "焗豆",
    "Beans, baked, home prepared": "焗豆",
    "Beans, baked, canned, no salt added": "焗豆",
    "Beans, baked, canned, with franks": "香肠焗豆",
    "Beans, baked, canned, with beef": "牛肉焗豆",
    "Beans, baked, canned, with pork and sweet sauce": "甜酱猪肉焗豆",
    "Beans, liquid from stewed kidney beans": "炖腰豆汤汁",
    "Soy sauce made from soy (tamari)": "日式酱油（塔马里）",
    "Soy sauce made from soy and wheat (shoyu), low sodium": "低钠酱油",
    "Soy sauce made from hydrolyzed vegetable protein": "水解植物蛋白酱油",
    "Oil, PAM cooking spray, original": "烹饪喷雾油",
    "Chickpea flour (besan)": "鹰嘴豆粉",
    "KRAFT BREAKSTONE'S Reduced Fat Sour Cream": "低脂酸奶油",
    "KRAFT BREAKSTONE'S FREE Fat Free Sour Cream": "无脂酸奶油",
    "Yogurt, fruit, low fat, 10 grams protein per 8 ounce": "低脂水果酸奶",
    "Yogurt, frozen, flavors other than chocolate, lowfat": "低脂冷冻酸奶",
    "Yogurt, frozen, flavors not chocolate, nonfat milk, with low-calorie sweetener": "无脂冷冻酸奶",
    "Yogurt, plain, nonfat": "原味无脂酸奶",
    "Yogurt, plain, low fat": "原味低脂酸奶",
    "Yogurt, plain, skim milk": "原味脱脂酸奶",
    "Yogurt, chocolate, nonfat milk, fortified with vitamin D": "巧克力无脂酸奶",
    "Yogurt, vanilla flavor, lowfat milk, sweetened with low calorie sweetener": "香草低脂酸奶",
    "Yogurt, vanilla or lemon flavor, nonfat milk, sweetened with low-calorie sweetener, fortified with vitamin D": "香草或柠檬味无脂酸奶",
    "Yogurt, fruit variety, nonfat, fortified with vitamin D": "水果无脂酸奶",
    "Yogurt, fruit, lowfat, with low calorie sweetener, fortified with vitamin D": "低脂水果酸奶",
    "Yogurt, Greek, Blueberry, CHOBANI": "蓝莓希腊酸奶",
    "Yogurt, Greek, nonfat, strawberry, DANNON OIKOS": "草莓无脂希腊酸奶",
    "Yogurt, Greek, whole, plain, CHOBANI": "原味全脂希腊酸奶",
    "Yogurt, Greek, 2% fat, apricot, CHOBANI": "杏味 2% 脂肪希腊酸奶",
    "Yogurt, Greek, vanilla, nonfat": "香草无脂希腊酸奶",
    "SILK Vanilla soy yogurt (single serving size)": "香草豆乳酸奶",
    "SILK Vanilla soy yogurt (family size)": "香草豆乳酸奶",
    "SILK Plus Omega-3 DHA, soymilk": "欧米伽-3 豆乳",
    "SILK Plus for Bone Health, soymilk": "强化钙豆乳",
    "SILK Original Creamer": "豆乳咖啡伴侣",
    "Vitasoy USA Organic Nasoya, Tofu Plus Extra Firm": "超硬豆腐",
    "Vitasoy USA Organic Nasoya Sprouted, Tofu Plus Super Firm": "超硬发芽豆腐",
    "Vitasoy USA Azumaya, Silken Tofu": "嫩豆腐",
    "Pasta, whole-wheat, cooked (Includes foods for USDA's Food Distribution Program)": "全麦意大利面",
    "Pasta, whole-wheat, dry (Includes foods for USDA's Food Distribution Program)": "全麦意大利面",
    "Pasta, dry, unenriched": "意大利面",
    "Pasta, dry, enriched": "强化意大利面",
    "Pasta, fresh-refrigerated, plain, as purchased": "新鲜意大利面",
    "Pasta, fresh-refrigerated, spinach, as purchased": "菠菜意大利面",
    "Pasta, gluten-free, corn and rice flour, cooked": "无麸质玉米米粉意大利面",
    "Pasta, gluten-free, corn, dry": "无麸质玉米意大利面",
    "Pasta, gluten-free, brown rice flour, cooked, TINKYADA": "无麸质糙米意大利面",
    "Pasta, gluten-free, rice flour and rice bran extract, cooked, DE BOLES": "无麸质米粉意大利面",
    "Pasta, homemade, made with egg, cooked": "鸡蛋意大利面",
    "Pasta, homemade, made without egg, cooked": "无蛋意大利面",
    "Noodles, japanese, somen, dry": "日式素面",
    "Noodles, chinese, chow mein": "中式炒面",
    "Noodles, chinese, cellophane or long rice (mung beans), dehydrated": "粉丝",
    "Noodles, egg, dry, unenriched": "鸡蛋面",
    "Noodles, egg, spinach, enriched, dry": "菠菜鸡蛋面",
    "Noodles, flat, crunchy, Chinese restaurant": "中式脆炒面",
    "Chayote, fruit, raw": "佛手瓜",
    "Horned melon (Kiwano)": "刺角瓜",
    "Nance, frozen, unsweetened": "南美酸浆果",
    "Naranjilla (lulo) pulp, frozen, unsweetened": "鲁洛果果肉",
    "Ruffed Grouse, breast meat, skinless, raw": "松鸡胸肉",
    "Dove, cooked (includes squab)": "乳鸽肉",
    "Escarole, cooked, boiled, drained, no salt added": "菊苣",
    "Malabar spinach, cooked": "木耳菜",
    "Beans, pinto, immature seeds, frozen, unprepared": "未成熟斑豆",
    "Beans, pinto, mature seeds, sprouted, raw": "发芽斑豆",
    "Beans, pinto, canned, drained solids": "斑豆",
    "Beans, pinto, mature seeds, raw (Includes foods for USDA's Food Distribution Program)": "斑豆",
    "Beans, pinto, mature seeds, raw": "斑豆",
    "Beans, mung, mature seeds, sprouted, canned, drained solids": "绿豆芽",
    "Beans, mung, mature seeds, sprouted, raw": "绿豆芽",
    "Beans, kidney, mature seeds, sprouted, raw": "发芽腰豆",
    "Beans, navy, mature seeds, raw": "白腰豆",
    "Beans, navy, mature seeds, sprouted, raw": "发芽白腰豆",
    "Beans, black turtle, mature seeds, raw": "黑豆",
    "Beans, adzuki, mature seed, cooked, boiled, with salt": "红豆",
    "Beans, cranberry (roman), mature seeds, raw": "花豆",
    "Beans, kidney, red, mature seeds, raw": "红腰豆",
    "Beans, kidney, california red, mature seeds, raw": "加州红腰豆",
    "Beans, kidney, royal red, mature seeds, raw": "皇家红腰豆",
    "Beans, white, mature seeds, raw": "白豆",
    "Beans, french, mature seeds, raw": "法国豆",
    "Beans, great northern, mature seeds, raw (Includes foods for USDA's Food Distribution Program)": "大北方豆",
    "Beans, small white, mature seeds, raw": "小白豆",
    "Peas, split, mature seeds, cooked, boiled, without salt": "豌豆",
    "Peas, green, split, mature seeds, raw": "青豌豆",
    "Peas, green, canned, no salt added, solids and liquids": "青豌豆",
    "Peas, green, canned, drained solids, rinsed in tap water": "青豌豆",
    "Peas, edible-podded, frozen, cooked, boiled, drained, without salt": "荷兰豆",
    "Seeds, sunflower seed kernels from shell, dry roasted, with salt added": "葵花籽仁",
    "Seeds, sunflower seed kernels, dried": "葵花籽仁",
    "Seeds, pumpkin and squash seeds, whole, roasted, without salt": "南瓜籽",
    "Seeds, pumpkin and squash seed kernels, dried": "南瓜籽仁",
    "Seeds, chia seeds, dried": "奇亚籽",
    "Seeds, hemp seed, hulled": "火麻仁",
    "Seeds, cottonseed kernels, roasted (glandless)": "棉籽仁",
    "Seeds, safflower seed kernels, dried": "红花籽仁",
    "Seeds, watermelon seed kernels, dried": "西瓜籽仁",
    "Seeds, breadfruit seeds, raw": "面包果籽",
    "Seeds, breadnut tree seeds, raw": "面包坚果籽",
    "Seeds, sisymbrium sp. seeds, whole, dried": "Sisymbrium 种子",
    "Seeds, sunflower seed flour, partially defatted": "葵花籽粉",
    "Seeds, cottonseed flour, partially defatted (glandless)": "棉籽粉",
    "Seeds, sunflower seed butter, without salt": "葵花籽酱",
    "Fish, cusk, raw": "鳕形鱼",
    "Fish, surimi": "鱼糜",
    "Fish, scup, raw": "鲷鱼",
    "Fish, burbot, raw": "江鳕",
    "Fish, cisco, raw": "湖白鲑",
    "Fish, gefiltefish, commercial, sweet recipe": "甜味鱼丸",
    "Fish, trout, rainbow, farmed, raw": "养殖虹鳟",
    "Fish, trout, seatrout, mixed species, raw": "海鳟",
    "Fish, butterfish, raw": "鲳鱼",
    "Fish, milkfish, raw": "虱目鱼",
    "Fish, rockfish, Pacific, mixed species, raw": "太平洋岩鱼",
    "Fish, halibut, Atlantic and Pacific, raw": "比目鱼",
    "Fish, tuna salad": "金枪鱼沙拉",
    "Fish, roe, mixed species, raw": "鱼卵",
    "Fish, salmon, Atlantic, farm raised, raw": "养殖大西洋三文鱼",
    "Fish, herring, Atlantic, raw": "大西洋鲱鱼",
    "Fish, mackerel, Atlantic, raw": "大西洋鲭鱼",
    "Fish, sardine, Pacific, canned in tomato sauce, drained solids with bone": "番茄酱沙丁鱼",
    "Fish, sea bass, mixed species, raw": "海鲈鱼",
    "Fish, carp, raw": "鲤鱼",
    "Fish, catfish, farm raised, raw": "养殖鲶鱼",
    "Fish, tilapia, farm raised, raw": "养殖罗非鱼",
    "Fish, eel, mixed species, raw": "鳗鱼",
    "Fish, swordfish, raw": "剑鱼",
    "Fish, shark, mixed species, raw": "鲨鱼",
    "Fish, grouper, mixed species, raw": "石斑鱼",
    "Fish, bass, striped, raw": "条纹鲈鱼",
    "Fish, snapper, mixed species, raw": "鲷鱼",
    "Fish, yellowtail, mixed species, raw": "黄尾鱼",
    "Fish, tilefish, raw": "方头鱼",
    "Fish, mahimahi, raw": "鲯鳅",
    "Fish, anchovy, european, raw": "欧洲鳀鱼",
    "Fish, pompano, florida, raw": "佛罗里达鲳鱼",
    "Fish, spot, raw": "斑点鱼",
    "Fish, wolffish, Atlantic, raw": "大西洋狼鱼",
    "Fish, croaker, Atlantic, raw": "大西洋黄鱼",
    "Fish, pike, northern, raw": "北方狗鱼",
    "Fish, turbot, european, raw": "欧洲大菱鲆",
    "Fish, sucker, white, raw": "白吸盘鱼",
    "Fish, caviar, black and red, granular": "黑红鱼子酱",
    "Fish oil, sardine": "沙丁鱼鱼油",
    "Fish oil, cod liver": "鳕鱼肝油",
    "Crustaceans, crayfish, mixed species, wild, raw": "野生小龙虾",
    "Crustaceans, spiny lobster, mixed species, raw": "刺龙虾",
    "Mollusks, cuttlefish, mixed species, raw": "墨鱼",
    "Mollusks, abalone, mixed species, raw": "鲍鱼",
    "Mollusks, octopus, common, raw": "章鱼",
    "Mollusks, scallop, mixed species, raw": "扇贝",
    "Mollusks, clam, mixed species, raw": "蛤蜊",
    "Mollusks, mussel, blue, raw": "青口",
    "Mushrooms, white, raw": "白蘑菇",
    "Mushrooms, white, cooked, boiled, drained, without salt": "白蘑菇",
    "Mushrooms, white, stir-fried": "白蘑菇",
    "Mushrooms, white, microwaved": "白蘑菇",
    "Mushroom, white, exposed to ultraviolet light, raw": "白蘑菇",
    "Mushrooms, portabella, raw": "波特贝勒蘑菇",
    "Mushrooms, portabella, exposed to ultraviolet light, raw": "波特贝勒蘑菇",
    "Mushrooms, maitake, raw": "舞茸",
    "Mushrooms, straw, canned, drained solids": "草菇",
    "Mushrooms, canned, drained solids": "罐装蘑菇",
    "Mushrooms, brown, italian, or crimini, raw": "褐蘑菇",
    "Mushrooms, chanterelle, raw": "鸡油菌",
    "Mushrooms, shiitake, stir-fried": "香菇",
    "Mushrooms, shiitake, raw": "香菇",
    "Mushrooms, morel, raw": "羊肚菌",
    "Mushroom, beech": "蟹味菇",
    "Mushroom, king oyster": "杏鲍菇",
    "Mushroom, pioppini": "茶树菇",
    "Mushroom, lion's mane": "猴头菇",
    "Cabbage, common (danish, domestic, and pointed types), freshly harvest, raw": "普通甘蓝",
    "Cabbage, chinese (pak-choi), cooked, boiled, drained, without salt": "小白菜",
    "Cabbage, chinese (pe-tsai), cooked, boiled, drained, without salt": "大白菜",
    "Cabbage, chinese (pe-tsai), raw": "大白菜",
    "Cabbage, red, cooked, boiled, drained, without salt": "紫甘蓝",
    "Cabbage, savoy, cooked, boiled, drained, without salt": "皱叶甘蓝",
    "Cabbage, savoy, raw": "皱叶甘蓝",
    "Cabbage, cooked, boiled, drained, without salt": "甘蓝",
    "Cabbage, common, cooked, boiled, drained, with salt": "普通甘蓝",
    "Cabbage, mustard, salted": "芥菜",
    "Cabbage, kimchi": "泡菜",
    "Cabbage, japanese style, fresh, pickled": "日式腌白菜",
    "Peppers, sweet, yellow, raw": "黄甜椒",
    "Peppers, sweet, red, raw": "红甜椒",
    "Peppers, sweet, green, raw": "青甜椒",
    "Peppers, chili, green, canned": "罐装青辣椒",
    "Peppers, hot chili, green, raw": "青辣椒",
    "Peppers, jalapeno, raw": "墨西哥辣椒",
    "Peppers, jalapeno, seeded, raw": "去籽墨西哥辣椒",
    "Peppers, serrano, raw": "塞拉诺辣椒",
    "Peppers, serrano, seeded, raw": "去籽塞拉诺辣椒",
    "Peppers, ancho, dried": "安乔辣椒",
    "Peppers, pasilla, dried": "帕西拉辣椒",
    "Peppers, hungarian, raw": "匈牙利辣椒",
    "Peppers, hot pickled, canned": "罐装腌辣椒",
    "Peppers, chili, with beans, canned": "豆豉辣椒",
    "Peppers, hot chile, sun-dried": "干辣椒",
    "Oil, grapeseed": "葡萄籽油",
    "Oil, walnut": "核桃油",
    "Oil, avocado": "牛油果油",
    "Oil, almond": "杏仁油",
    "Oil, mustard": "芥末油",
    "Oil, safflower, salad or cooking, high oleic (primary safflower oil of commerce)": "高油酸红花籽油",
    "Oil, sunflower, high oleic (70% and over)": "高油酸葵花籽油",
    "Oil, vegetable, soybean, refined": "精炼大豆油",
    "Oil, palm": "棕榈油",
    "Oil, peanut, salad or cooking": "花生油",
    "Oil, olive, salad or cooking": "橄榄油",
    "Oil, soybean, salad or cooking": "大豆油",
    "Oil, sesame, salad or cooking": "芝麻油",
    "Oil, rice bran": "米糠油",
    "Oil, sunflower, linoleic (less than 60%)": "亚油酸型葵花籽油",
    "Oil, corn, and canola": "玉米菜籽混合油",
    "Oil, corn and canola": "玉米菜籽混合油",
    "Oil, corn, peanut, and olive": "玉米花生橄榄混合油",
    "Oil, corn, industrial and retail, all purpose salad or cooking": "玉米油",
    "Oil, industrial, canola for salads, woks and light frying": "菜籽油",
    "Oil, industrial, canola (partially hydrogenated) oil for deep fat frying": "氢化菜籽油",
    "Oil, industrial, coconut (hydrogenated), used for whipped toppings and coffee whiteners": "氢化椰子油",
    "Oil, industrial, coconut, principal uses candy coatings, oil sprays, roasting nuts": "椰子油",
    "Oil, industrial, soy, refined, for woks and light frying": "精炼大豆油",
    "Oil, industrial, canola with antifoaming agent, principal uses salads, woks and light frying": "菜籽油",
    "Oil, industrial, palm kernel (hydrogenated), used for whipped toppings, non-dairy": "氢化棕榈仁油",
    "Oil, cooking and salad, ENOVA, 80% diglycerides": "甘油二酯烹饪油",
    "Beans, yellow, mature seeds, raw": "黄豆",
    "Seeds, sesame butter, tahini, from raw and stone ground kernels": "芝麻酱",
    "Peas, split, mature seeds, cooked, boiled, without salt": "干豌豆",
    "Nuts, almond paste": "杏仁膏",
    "Oil, industrial, mid-oleic, sunflower": "中油酸葵花籽油",
    "Oil, sunflower, linoleic, (partially hydrogenated)": "氢化亚油酸型葵花籽油",
    "Chard, swiss, raw": "瑞士甜菜",
    "Vermicelli, made from soy": "豆制粉丝",
    "Fish, flatfish (flounder and sole species), raw": "鲽鱼",
    "Oil, industrial, canola with antifoaming agent, principal uses salads, woks and light frying": "含消泡剂菜籽油",
    "Oil, vegetable, Natreon canola, high stability, non trans, high oleic (70%)": "高油酸菜籽油",
    "Oil, industrial, canola, high oleic": "高油酸菜籽油",
    "Ruby Red grapefruit juice blend (grapefruit, grape, apple), OCEAN SPRAY, bottled, with added vitamin C": "红宝石葡萄柚复合果汁",
    "Soy protein concentrate, produced by alcohol extraction": "大豆蛋白浓缩物",
    "Oil, industrial, coconut, principal uses candy coatings, oil sprays, roasting nuts": "工业用椰子油",
    "Fish, scup, raw": "鲷鱼（Scup）",
    "Fish, snapper, mixed species, raw": "笛鲷",
    "Chicory greens, raw": "菊苣叶",
    "Escarole, cooked, boiled, drained, no salt added": "菊苣（Escarole）",
    "Oil, corn, industrial and retail, all purpose salad or cooking": "普通玉米油",
    "Beans, snap, yellow, raw": "黄四季豆",
    "Beans, snap, canned, all styles, seasoned, solids and liquids": "调味四季豆",
    "Peas, green, split, mature seeds, raw": "干青豌豆",
    "Peas, green, canned, no salt added, solids and liquids": "青豌豆",
    "Peas, green, canned, drained solids, rinsed in tap water": "青豌豆",
    "Peas, green, canned, regular pack, solids and liquids": "青豌豆",
    "Peas, green, frozen, unprepared (Includes foods for USDA's Food Distribution Program)": "青豌豆",
    "Peas, green, frozen, cooked, boiled, drained, without salt": "青豌豆",
    "Peas, mature seeds, sprouted, raw": "发芽豌豆",
    "Peas, green, canned, seasoned, solids and liquids": "调味青豌豆",
    "Oil, olive, salad or cooking": "普通橄榄油",
    "Oil, soybean lecithin": "大豆卵磷脂",
    "Oil, soybean, salad or cooking": "普通大豆油",
    "Noodles, egg, dry, enriched": "强化鸡蛋面",
    "Broadbeans (fava beans), mature seeds, raw": "蚕豆",
    "Beans, fava, in pod, raw": "鲜蚕豆荚",
    "Yogurt, fruit, lowfat, with low calorie sweetener, fortified with vitamin D": "低脂加甜水果酸奶",
    "Oil, industrial, palm and palm kernel, filling fat (non-hydrogenated)": "棕榈仁填充脂",
    "Oil, industrial, palm kernel, confection fat, uses similar to high quality cocoa butter": "棕榈仁糖果脂",
    "Oil, industrial, palm kernel (hydrogenated), used for whipped toppings, non-dairy": "氢化棕榈仁油",
    "Oil, palm": "棕榈油",
    "Nuts, coconut milk, raw (liquid expressed from grated meat and water)": "椰浆",
    "Nuts, coconut cream, raw (liquid expressed from grated meat)": "椰浆（椰肉提取）",
    "Noodles, egg, dry, unenriched": "鸡蛋面",
    "Oil, nutmeg butter": "肉豆蔻脂",
    "Oil, cottonseed, salad or cooking": "棉籽油",
    "Oil, industrial, soy (partially hydrogenated)  and cottonseed, principal use as a tortilla shortening": "大豆棉籽混合油",
    "Oil, industrial, soy (partially hydrogenated ) and soy (winterized), pourable clear fry": "冬化大豆油",
    "Vegetable oil, palm kernel": "棕榈仁油",
    "Oil, cocoa butter": "可可脂",
    "Oil, flaxseed, contains added sliced flaxseed": "亚麻籽油",
    "Oil, cupu assu": "库普阿苏油",
    "Oil, ucuhuba butter": "乌库巴脂",
    "Oil, poppyseed": "罂粟籽油",
    "Oil, sheanut": "乳木果油",
    "Oil, flaxseed, cold pressed": "冷榨亚麻籽油",
    "Oil, babassu": "巴巴苏油",
    "Oil, wheat germ": "小麦胚芽油",
    "Oil, industrial, cottonseed, fully hydrogenated": "全氢化棉籽油",
    "Oil, teaseed": "茶籽油",
    "Oil, industrial, soy (partially hydrogenated), multiuse for non-dairy butter flavor": "大豆非乳制黄油风味油",
    "Oil, hazelnut": "榛子油",
    "Oil, oat": "燕麦油",
    "Oil, tomatoseed": "番茄籽油",
    "Oil, olive, extra virgin": "特级初榨橄榄油",
    "Beans, chili, barbecue, ranch style, cooked": "烧烤风味辣豆",
    "Beans, shellie, canned, solids and liquids": "嫩豆",
    "Rice, brown, medium-grain, raw (Includes foods for USDA's Food Distribution Program)": "中粒糙米",
    "Rice, white, medium-grain, raw, enriched": "强化中粒白米",
    "Rice, brown, parboiled, dry, UNCLE BEN'S": "蒸煮糙米",
    "Rice, white, short-grain, raw, unenriched": "短粒白米",
    "Pasta, dry, whole grain, spaghetti": "全麦意大利面",
    "Nutritional supplement for people with diabetes, liquid": "糖尿病营养补充液",
    "SILK Black Cherry soy yogurt": "黑樱桃豆乳酸奶",
    "SILK Key Lime soy yogurt": "青柠豆乳酸奶",
    "SILK Chocolate, soymilk": "巧克力豆乳",
    "SILK Coffee, soymilk": "咖啡豆乳",
    "SILK Hazelnut Creamer": "榛果咖啡伴侣",
    "SILK French Vanilla Creamer": "法式香草咖啡伴侣",
    "SILK Plain soy yogurt": "原味豆乳酸奶",
    "SILK Banana-Strawberry soy yogurt": "香蕉草莓豆乳酸奶",
    "SILK Strawberry soy yogurt": "草莓豆乳酸奶",
    "SILK Peach soy yogurt": "桃味豆乳酸奶",
    "SILK Blueberry soy yogurt": "蓝莓豆乳酸奶",
    "SILK Raspberry soy yogurt": "覆盆子豆乳酸奶",
    "SILK Chai, soymilk": "奶茶风味豆乳",
    "SILK Plus Fiber, soymilk": "高纤豆乳",
    "SILK Plain, soymilk": "原味豆乳",
    "SILK Vanilla, soymilk": "香草豆乳",
    "SILK Light Vanilla, soymilk": "淡香草豆乳",
    "SILK Light Chocolate, soymilk": "淡巧克力豆乳",
    "SILK Mocha, soymilk": "摩卡豆乳",
    "MORI-NU, Tofu, silken, firm": "硬豆腐",
    "HORMEL Canadian Style Bacon": "加拿大培根",
    "HORMEL ALWAYS TENDER, Boneless Pork Loin, Fresh Pork": "无骨猪里脊",
    "HORMEL ALWAYS TENDER, Center Cut Chops, Fresh Pork": "猪里脊排",
    "HORMEL, Cure 81 Ham": "腌制火腿",
    "Nuts, pilinuts, dried": "皮利坚果",
    "Nuts, acorns, raw": "橡子",
    "Nuts, butternuts, dried": "黄油坚果",
    "Nuts, beechnuts, dried": "山毛榉坚果",
    "Nuts, hickorynuts, dried": "山核桃",
    "Nuts, acorn flour, full fat": "橡子粉",
    "Nuts, coconut cream, raw (liquid expressed from grated meat)": "椰浆（椰肉提取）",
    "Nuts, coconut water (liquid from coconuts)": "椰子水",
    "Nuts, coconut meat, raw": "椰肉",
    "Peanut butter with omega-3, creamy": "欧米伽-3 花生酱",
    "Peas and onions, frozen, cooked, boiled, drained, without salt": "豌豆洋葱",
    "Peas and carrots, frozen, cooked, boiled, drained, without salt": "豌豆胡萝卜",
    "Peas, green, canned, regular pack, solids and liquids": "罐装青豌豆",
    "Peas, green, frozen, unprepared (Includes foods for USDA's Food Distribution Program)": "青豌豆",
    "Peas, green, frozen, cooked, boiled, drained, without salt": "青豌豆",
    "Peas, mature seeds, sprouted, raw": "发芽豌豆",
    "Peas, green, canned, seasoned, solids and liquids": "调味青豌豆",
    "Pimento, canned": "罐装甜椒",
    "Chili with beans, canned": "豆豉辣椒",
    "Milk, reduced fat, fluid, 2% milkfat, without added vitamin A and vitamin D": "低脂牛奶",
    "Milk, sheep, fluid": "羊奶",
    "Milk, human, mature, fluid": "人乳",
    "Milk substitutes, fluid, with lauric acid oil": "奶类替代饮品",
    "Sour cream, imitation, cultured": "酸奶油替代品",
    "Reddi Wip Fat Free Whipped Topping": "无脂打发配料",
    "Pomegranate juice, bottled": "石榴汁",
    "Shortening, industrial, soy (partially hydrogenated ) for baking and confections": "大豆烘焙酥油",
    "Shortening household soybean (hydrogenated) and palm": "大豆棕榈酥油",
    "Shortening frying (heavy duty), beef tallow and cottonseed": "牛脂棉籽炸油",
    "Mahi mahi, frozen, wild caught": "鲯鳅",
    "Pickle relish, sweet": "甜酸瓜菜",
    "Oil, industrial, palm kernel (hydrogenated) , used for whipped toppings, non-dairy": "氢化棕榈仁油",
    "Oil, industrial, soy, refined, for woks and light frying": "工业用精炼大豆油",
    "Yogurt, vanilla, low fat.": "低脂香草酸奶",
    "Yogurt, vanilla, non-fat": "无脂香草酸奶",
    "Beans, yellow, mature seeds, raw": "黄豆类",
    "Beans, kidney, all types, mature seeds, raw": "腰豆",
    "Fish, mahimahi, raw": "鲯鳅",
    "Fish, mullet, striped, raw": "条纹鲻鱼",
    "Fish, sturgeon, mixed species, raw": "鲟鱼",
    "Fish, drum, freshwater, raw": "淡水石首鱼",
    "Fish, sheepshead, raw": "羊头鱼",
    "Fish, whitefish, mixed species, raw": "白鱼",
    "Fish, sunfish, pumpkin seed, raw": "太阳鱼",
    "Fish, pout, ocean, raw": "海鳕",
    "Fish, smelt, rainbow, raw": "虹胡瓜鱼",
    "Fish, perch, mixed species, raw": "鲈鱼",
    "Fish, tuna, fresh, yellowfin, raw": "黄鳍金枪鱼",
    "Fish, bluefish, raw": "蓝鱼",
    "Fish, sablefish, raw": "银鳕鱼",
    "Fish, shad, american, raw": "美洲西鲱",
    "Fish, lingcod, raw": "长吻鳕",
    "Fish, ocean perch, Atlantic, raw": "大西洋红鱼",
    "Fish, roughy, orange, raw": "橙鲷鱼",
    "Fish, fish sticks, frozen, prepared": "鱼柳",
    "Fish, tuna, yellowfin, raw": "黄鳍金枪鱼",
    "Fish, caviar, black and red, granular": "黑红鱼子酱",
    "Hominy, canned, white": "罐装玉米碴",
    "Seaweed, Canadian Cultivated EMI-TSUNOMATA, dry": "EMI-TSUNOMATA 海藻",
    "Seaweed, Canadian Cultivated EMI-TSUNOMATA, rehydrated": "EMI-TSUNOMATA 海藻",
}

BEAN_NAMES = {
    "pinto": "斑豆", "kidney": "腰豆", "navy": "白腰豆", "pink": "粉红豆",
    "black turtle": "黑豆", "adzuki": "红豆", "cranberry": "花豆",
    "french": "法国豆", "mung": "绿豆", "great northern": "大北方豆",
    "small white": "小白豆", "lima": "利马豆", "fava": "蚕豆",
    "cowpea": "豇豆", "pigeon": "木豆", "snap": "四季豆", "soy": "黄豆",
}
FISH_NAMES = {
    "cusk": "鳕形鱼", "burbot": "江鳕", "cisco": "湖白鲑", "scup": "鲷鱼",
    "trout": "鳟鱼", "seatrout": "海鳟", "butterfish": "鲳鱼", "milkfish": "虱目鱼",
    "rockfish": "岩鱼", "halibut": "比目鱼", "roe": "鱼卵", "salmon": "三文鱼",
    "herring": "鲱鱼", "mackerel": "鲭鱼", "sardine": "沙丁鱼", "sea bass": "海鲈鱼",
    "carp": "鲤鱼", "catfish": "鲶鱼", "tilapia": "罗非鱼", "eel": "鳗鱼",
    "swordfish": "剑鱼", "shark": "鲨鱼", "grouper": "石斑鱼", "snapper": "鲷鱼",
    "yellowtail": "黄尾鱼", "tilefish": "方头鱼", "mahi mahi": "鲯鳅", "mahimahi": "鲯鳅",
    "anchovy": "鳀鱼", "pompano": "鲳鱼", "spot": "斑点鱼", "wolffish": "狼鱼",
    "croaker": "黄鱼", "pike": "狗鱼", "turbot": "大菱鲆", "sucker": "吸盘鱼",
    "fish sticks": "鱼柳", "surimi": "鱼糜", "caviar": "鱼子酱", "squid": "鱿鱼",
    "mullet": "鲻鱼", "sturgeon": "鲟鱼", "drum": "石首鱼", "sheepshead": "羊头鱼",
    "whitefish": "白鱼", "sunfish": "太阳鱼", "pout": "海鳕", "smelt": "胡瓜鱼",
    "perch": "鲈鱼", "yellowfin": "黄鳍金枪鱼", "bluefish": "蓝鱼", "sablefish": "银鳕鱼",
    "shad": "西鲱", "lingcod": "长吻鳕", "ocean perch": "大西洋红鱼", "roughy": "橙鲷鱼",
}
MUSHROOM_NAMES = {
    "white": "白蘑菇", "shiitake": "香菇", "enoki": "金针菇", "beech": "蟹味菇",
    "king oyster": "杏鲍菇", "pioppini": "茶树菇", "lion's mane": "猴头菇",
    "portabella": "波特贝勒蘑菇", "maitake": "舞茸", "straw": "草菇",
    "chanterelle": "鸡油菌", "morel": "羊肚菌", "crimini": "褐蘑菇",
}

BAD_PREFIXES = (
    "豆子", "豆类", "鱼", "油", "酸奶", "丝绸", "蘑菇", "种子", "坚果",
    "面条", "意大利面", "卷心菜", "白菜", "辣椒", "大米", "牛奶", "豌豆",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-catalog", type=Path, required=True)
    parser.add_argument("--sqlite", type=Path, help="首次生成 v24 时使用的来源 SQLite；已有目录应用人工标记时可省略")
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--out-catalog", type=Path, required=True)
    parser.add_argument("--out-report", type=Path, required=True)
    parser.add_argument(
        "--review-markings",
        type=Path,
        help="审核页导出的人工目录整理标记；支持 action=keep/remove/rename",
    )
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON 顶层必须是对象：{path}")
    return value


def load_curation_review(path: Path | None) -> dict[str, dict[str, str]]:
    """读取审核页导出的目录动作，并在进入目录处理前做严格校验。"""
    if path is None:
        return {}
    payload = load_json(path)
    contract = str(payload.get("contract", ""))
    if contract != CURATION_REVIEW_CONTRACT:
        raise ValueError(f"人工整理标记合同不匹配：{contract or '缺少 contract'}")
    actions = payload.get("actions")
    if not isinstance(actions, dict):
        raise ValueError("人工整理标记 actions 必须是对象")
    normalized: dict[str, dict[str, str]] = {}
    for concept_id, raw in actions.items():
        if not isinstance(raw, dict):
            raise ValueError(f"人工整理标记不是对象：{concept_id}")
        action = str(raw.get("action", "")).strip()
        if action not in {"keep", "remove", "rename"}:
            raise ValueError(f"人工整理标记动作不支持：{concept_id}={action}")
        new_name = str(raw.get("new_name", "")).strip()
        if action == "rename" and not new_name:
            raise ValueError(f"重写名称不能为空：{concept_id}")
        if "\n" in new_name or "\r" in new_name:
            raise ValueError(f"重写名称不能包含换行：{concept_id}")
        redirect_to = str(raw.get("redirect_to", "")).strip()
        if redirect_to and action != "remove":
            raise ValueError(f"只有去掉动作可以设置 redirect_to：{concept_id}")
        normalized[str(concept_id)] = {
            "action": action,
            "current_name": str(raw.get("current_name", "")).strip(),
            "new_name": new_name,
            **({"redirect_to": redirect_to} if redirect_to else {}),
        }
    return normalized


def source_rows(sqlite_path: Path) -> dict[str, dict[str, Any]]:
    with sqlite3.connect(sqlite_path) as conn:
        rows = conn.execute(
            """
            SELECT v.concept_id, r.source_version, f.description, l.name
            FROM ingredient_variant v
            JOIN source_food f
              ON f.source_release_id = v.source_release_id
             AND f.fdc_id = v.source_food_id
            JOIN source_release r ON r.release_id = v.source_release_id
            LEFT JOIN source_localized_name l
              ON l.source_release_id = v.source_release_id
             AND l.fdc_id = v.source_food_id
             AND l.locale = 'zh-CN'
            """
        ).fetchall()
    return {
        str(concept_id): {
            "source_version": str(source_version),
            "description": str(description).strip(),
            "localized_name": str(localized_name or "").strip(),
        }
        for concept_id, source_version, description, localized_name in rows
    }


def needs_curation(name: str, source_version: str) -> bool:
    if source_version != "sr_legacy_2018_04":
        return False
    return bool(
        "的" in name
        or re.search(r"[A-Za-z]", name)
        or any(name.startswith(prefix) for prefix in BAD_PREFIXES)
        or len(name) >= 11
        or any(token in name for token in ("未准备", "原装", "罐头", "沥干", "煮沸", "成熟的种子"))
    )


def parse_fallback(description: str, current: str, category: str) -> str:
    """给未进入人工词表的直译名称一个保守的短名。"""
    text = description.lower()
    if text.startswith("fish oil"):
        return "鱼油"
    if text.startswith("fish,"):
        phrase = text[5:].strip()
        for key, value in sorted(FISH_NAMES.items(), key=lambda pair: -len(pair[0])):
            if key in phrase:
                return value
        return "鱼类"
    if text.startswith("beans,"):
        if "baked" in text:
            return "焗豆"
        for key, value in sorted(BEAN_NAMES.items(), key=lambda pair: -len(pair[0])):
            if key in text:
                return value
        return "豆类"
    if text.startswith("peas,"):
        if "edible-podded" in text:
            return "荷兰豆"
        return "豌豆"
    if text.startswith("mushroom"):
        for key, value in sorted(MUSHROOM_NAMES.items(), key=lambda pair: -len(pair[0])):
            if key in text:
                return value
        return "蘑菇"
    if text.startswith("cabbage,"):
        if "savoy" in text:
            return "皱叶甘蓝"
        if "red" in text:
            return "紫甘蓝"
        if "pak-choi" in text:
            return "小白菜"
        if "pe-tsai" in text:
            return "大白菜"
        return "甘蓝"
    if text.startswith("peppers,"):
        for key, value in (
            ("jalapeno", "墨西哥辣椒"), ("serrano", "塞拉诺辣椒"),
            ("pasilla", "帕西拉辣椒"), ("ancho", "安乔辣椒"),
            ("hungarian", "匈牙利辣椒"), ("sweet, red", "红甜椒"),
            ("sweet, green", "青甜椒"), ("sweet, yellow", "黄甜椒"),
        ):
            if key in text:
                return value
        return "辣椒"
    if text.startswith("oil,"):
        for key, value in (
            ("grapeseed", "葡萄籽油"), ("sunflower", "葵花籽油"),
            ("safflower", "红花籽油"), ("soybean", "大豆油"),
            ("canola", "菜籽油"), ("olive", "橄榄油"), ("peanut", "花生油"),
            ("sesame", "芝麻油"), ("coconut", "椰子油"), ("almond", "杏仁油"),
            ("walnut", "核桃油"), ("avocado", "牛油果油"), ("palm", "棕榈油"),
        ):
            if key in text:
                return value
        return "植物油"
    if text.startswith("yogurt,"):
        if "chocolate" in text:
            return "巧克力酸奶"
        if "vanilla" in text:
            return "香草酸奶"
        if "strawberry" in text:
            return "草莓酸奶"
        if "blueberry" in text:
            return "蓝莓酸奶"
        if "greek" in text:
            return "希腊酸奶"
        return "酸奶"
    if text.startswith("pasta,"):
        if "whole-wheat" in text:
            return "全麦意大利面"
        if "gluten-free" in text:
            return "无麸质意大利面"
        return "意大利面"
    if text.startswith("noodles,"):
        if "soba" in text:
            return "荞麦面"
        if "somen" in text:
            return "素面"
        if "chow mein" in text:
            return "炒面"
        if "egg" in text:
            return "鸡蛋面"
        return "面条"
    if text.startswith("seeds,"):
        for key, value in (
            ("sunflower", "葵花籽"), ("pumpkin", "南瓜籽"), ("watermelon", "西瓜籽"),
            ("chia", "奇亚籽"), ("flax", "亚麻籽"), ("hemp", "火麻仁"),
            ("cotton", "棉籽"), ("safflower", "红花籽"),
        ):
            if key in text:
                return value
        return "种子"
    if text.startswith("nuts,"):
        for key, value in (
            ("almond butter", "杏仁酱"), ("cashew butter", "腰果酱"),
            ("coconut", "椰子"), ("mixed nuts", "混合坚果"),
            ("almond", "杏仁"), ("cashew", "腰果"), ("walnut", "核桃"),
        ):
            if key in text:
                return value
        return "坚果"
    if text.startswith("milk,"):
        if "goat" in text:
            return "山羊奶"
        if "evaporated" in text:
            return "淡奶"
        if "condensed" in text:
            return "炼乳"
        if "dry" in text:
            return "奶粉"
        return "牛奶"
    if text.startswith("silk "):
        if "soy yogurt" in text:
            for key, value in (
                ("black cherry", "黑樱桃"), ("key lime", "青柠"), ("banana-strawberry", "香蕉草莓"),
                ("strawberry", "草莓"), ("blueberry", "蓝莓"), ("raspberry", "覆盆子"),
                ("peach", "桃味"), ("vanilla", "香草"), ("plain", "原味"),
            ):
                if key in text:
                    return f"{value}豆乳酸奶"
            return "豆乳酸奶"
        if "creamer" in text:
            return "咖啡伴侣"
        for key, value in (
            ("chocolate", "巧克力"), ("coffee", "咖啡"), ("chai", "奶茶风味"),
            ("vanilla", "香草"), ("plain", "原味"),
        ):
            if key in text:
                return f"{value}豆乳"
        return "豆乳"
    if text.startswith("rice,"):
        if "brown" in text and "parboiled" in text:
            return "蒸煮糙米"
        if "brown" in text:
            return "糙米"
        if "short-grain" in text:
            return "短粒白米"
        if "medium-grain" in text and "enriched" in text:
            return "强化中粒白米"
        return "白米"
    if text.startswith("crustaceans,"):
        if "crayfish" in text:
            return "小龙虾"
        if "lobster" in text:
            return "龙虾"
        if "shrimp" in text:
            return "虾"
        return "甲壳类"
    if text.startswith("mollusks,"):
        if "cuttlefish" in text:
            return "墨鱼"
        if "abalone" in text:
            return "鲍鱼"
        if "octopus" in text:
            return "章鱼"
        if "scallop" in text:
            return "扇贝"
        if "clam" in text:
            return "蛤蜊"
        if "mussel" in text:
            return "青口"
        return "软体动物"
    # 最后的兜底只去掉明显的状态尾巴，不把不确定身份误写成另一个食材。
    result = re.sub(
        r"(?:来源状态未注明|未准备好的|成熟的种子|成熟种子|生的|熟制|冷冻的|罐头|沥干不加盐|沥干加盐|干燥|干)$",
        "",
        current,
    ).strip("，, ")
    return result or current


def curated_name(item: dict[str, Any], source: dict[str, Any]) -> tuple[str, str]:
    current = str(item["canonical_name_zh"])
    description = str(source["description"])
    source_version = str(source["source_version"])
    if description in EXACT_NAMES:
        return EXACT_NAMES[description], "exact_description_curation"
    if not needs_curation(current, source_version):
        return current, "unchanged"
    return parse_fallback(description, current, str(item.get("category_code", ""))), "structured_fallback"


def state_label(variant: dict[str, Any]) -> str:
    state = str(variant.get("preparation_state") or "").lower()
    return {
        "raw": "生", "fresh": "鲜", "dry": "干制", "dried": "干制",
        "frozen": "冷冻", "canned": "罐装", "cooked": "熟制", "prepared": "加工",
        "boiled": "熟制", "simmered": "熟制", "braised": "熟制", "fried": "熟制",
        "roasted": "熟制", "steamed": "熟制",
    }.get(state, "")


def display_name(canonical: str, variant: dict[str, Any]) -> str:
    label = state_label(variant)
    if not label or canonical.endswith(f"（{label}）"):
        return canonical
    return f"{canonical}（{label}）"


def normalize_alias(value: str) -> str:
    return "".join(value.strip().lower().split())


def sanitize_aliases(items: list[dict[str, Any]]) -> list[dict[str, str]]:
    """保留规范名称优先，删除名称清理后产生的跨概念别名冲突。"""
    canonical_owners: dict[str, str] = {}
    for item in items:
        key = normalize_alias(str(item["canonical_name_zh"]))
        owner = canonical_owners.get(key)
        if owner and owner != item["concept_id"]:
            raise ValueError(f"名称整理后规范名称冲突：{item['canonical_name_zh']}")
        canonical_owners[key] = str(item["concept_id"])

    owners = dict(canonical_owners)
    conflicts: list[dict[str, str]] = []
    for item in items:
        kept: list[str] = []
        for alias in item.get("aliases", []):
            alias = str(alias).strip()
            key = normalize_alias(alias)
            if not key or key == normalize_alias(str(item["canonical_name_zh"])):
                continue
            previous = owners.get(key)
            if previous and previous != item["concept_id"]:
                conflicts.append({
                    "alias": alias,
                    "normalized_alias": key,
                    "kept_concept_id": previous,
                    "dropped_concept_id": str(item["concept_id"]),
                })
                continue
            owners[key] = str(item["concept_id"])
            if alias not in kept:
                kept.append(alias)
        item["aliases"] = kept
    return conflicts


MERGE_GROUPS = (
    {
        "group_id": "sweetened_condensed_milk",
        "label_zh": "炼乳",
        "retained_concept_id": "ingredient_auto_f054f4c5ecfd08bc",
        "concept_ids": (
            "ingredient_auto_f054f4c5ecfd08bc",
            "ingredient_usda_1dc68dc2ee59c4bad424",
        ),
        "rule_zh": "同一甜炼乳身份仅因来源目录或罐装表述不同，合并为炼乳。",
    },
    {
        "group_id": "white_rice_flour",
        "label_zh": "白米粉",
        "retained_concept_id": "ingredient_stage4_d3f8582f11d960d1",
        "concept_ids": (
            "ingredient_stage4_d3f8582f11d960d1",
            "ingredient_usda_16a1fa4275ed3f84dbba",
        ),
        "rule_zh": "同一白米粉身份仅因 Flour/Rice flour 来源描述不同，合并为白米粉。",
    },
    {
        "group_id": "red_leaf_lettuce",
        "label_zh": "红叶生菜",
        "retained_concept_id": "ingredient_usda_84b9127f5c8073f5d690",
        "concept_ids": (
            "ingredient_usda_84b9127f5c8073f5d690",
            "ingredient_usda_0b80fb387404dcbb7b50",
        ),
        "rule_zh": "同一红叶生菜身份仅因 leaf/red 词序不同，合并为红叶生菜。",
    },
    {
        "group_id": "green_leaf_lettuce",
        "label_zh": "绿叶生菜",
        "retained_concept_id": "ingredient_usda_c8f21318b943dff50c54",
        "concept_ids": (
            "ingredient_usda_c8f21318b943dff50c54",
            "ingredient_usda_58d4493494c5fd099f2b",
        ),
        "rule_zh": "同一绿叶生菜身份仅因 leaf/green 词序不同，合并为绿叶生菜。",
    },
    {
        "group_id": "soy_flour",
        "label_zh": "大豆粉",
        "retained_concept_id": "ingredient_usda_e71d4dff16ab27138465",
        "concept_ids": (
            "ingredient_usda_e71d4dff16ab27138465",
            "ingredient_usda_56554550b0d941868993",
        ),
        "rule_zh": "同一全脂大豆粉身份仅因 Soy/Flour 词序不同，合并为大豆粉。",
    },
    {
        "group_id": "potato_flour",
        "label_zh": "土豆粉",
        "retained_concept_id": "ingredient_usda_a5522802873fba7e9d92",
        "concept_ids": (
            "ingredient_usda_a5522802873fba7e9d92",
            "ingredient_usda_6e5ef0848420a971c8a7",
        ),
        "rule_zh": "同一土豆粉身份仅因 potato/flour 来源名称不同，合并为土豆粉。",
    },
    {
        "group_id": "whole_wheat_pasta",
        "label_zh": "全麦意大利面",
        "retained_concept_id": "ingredient_spaghetti",
        "concept_ids": (
            "ingredient_spaghetti",
            "ingredient_usda_0fc9bc1f207bacaa1a95",
            "ingredient_usda_94c07abe475827d7e5c9",
        ),
        "rule_zh": "同一全麦意大利面仅因干制/熟制不同，合并为一个食材；默认来源保留熟制前的稳定基准。",
    },
    {
        "group_id": "emi_tsunomata_seaweed",
        "label_zh": "海藻（EMI-TSUNOMATA）",
        "retained_concept_id": "ingredient_usda_28e797866ab0e55dfd32",
        "concept_ids": (
            "ingredient_usda_28e797866ab0e55dfd32",
            "ingredient_usda_f8de27195abb7b1b1919",
        ),
        "rule_zh": "同一 EMI-TSUNOMATA 海藻仅因干制/复水不同，合并为一个食材。",
    },
    {
        "group_id": "shiitake_mushroom_preparation",
        "label_zh": "香菇",
        "retained_concept_id": "ingredient_auto_11baeb27adb35043",
        "concept_ids": ("ingredient_auto_11baeb27adb35043", "ingredient_usda_ecff1cedd504f9b86bdc"),
        "rule_zh": "同一香菇仅因生食/炒制不同，合并为香菇。",
    },
    {
        "group_id": "white_button_mushroom_preparation",
        "label_zh": "白蘑菇",
        "retained_concept_id": "ingredient_auto_64d2d61b21ee1ec6",
        "concept_ids": (
            "ingredient_auto_64d2d61b21ee1ec6", "ingredient_usda_10331b402b132baacfd1",
            "ingredient_usda_78bf2ad45dc3a3383480", "ingredient_usda_8312b736a58858da54f3",
            "ingredient_usda_cd84452ccad2bbb8df58", "ingredient_usda_e13655b00e227ebf8994",
        ),
        "rule_zh": "同一白蘑菇仅因生食、熟制、微波或紫外线处理不同，合并为白蘑菇。",
    },
    {
        "group_id": "peanut_oil_preparation",
        "label_zh": "花生油",
        "retained_concept_id": "ingredient_auto_84b8f82ce164d1ec",
        "concept_ids": ("ingredient_auto_84b8f82ce164d1ec", "ingredient_usda_ab9f0f4a41dd286a3c0e"),
        "rule_zh": "同一花生油仅因用途写成 salad/cooking 不同，合并为花生油。",
    },
    {
        "group_id": "red_leaf_cabbage_preparation",
        "label_zh": "紫甘蓝",
        "retained_concept_id": "ingredient_auto_model_aff28826f1d12c2a",
        "concept_ids": ("ingredient_auto_model_aff28826f1d12c2a", "ingredient_usda_1f2fb624249e5f02e9b2"),
        "rule_zh": "同一紫甘蓝仅因生食/煮制不同，合并为紫甘蓝。",
    },
    {
        "group_id": "adzuki_bean_preparation",
        "label_zh": "红豆",
        "retained_concept_id": "ingredient_auto_model_e9e73aa2dd8c70bc",
        "concept_ids": ("ingredient_auto_model_e9e73aa2dd8c70bc", "ingredient_usda_5a11f1a432abb8892bee"),
        "rule_zh": "同一红豆仅因生食/煮制不同，合并为红豆。",
    },
    {
        "group_id": "bok_choy_preparation",
        "label_zh": "小白菜",
        "retained_concept_id": "ingredient_bok_choy",
        "concept_ids": (
            "ingredient_bok_choy", "ingredient_usda_1cdaf38fc2447f86b781", "ingredient_usda_7410348bba118a946bf2",
        ),
        "rule_zh": "同一小白菜仅因 bok choy/pak-choi 词名和生熟状态不同，合并为小白菜。",
    },
    {
        "group_id": "green_pea_preparation",
        "label_zh": "青豌豆",
        "retained_concept_id": "ingredient_green_peas",
        "concept_ids": (
            "ingredient_green_peas", "ingredient_usda_4d783b8b9f5580be2053", "ingredient_usda_5689697621784f44a804",
            "ingredient_usda_764f309559239f41cb6e", "ingredient_usda_8a8ba0d85f83bd3ac251",
        ),
        "rule_zh": "同一青豌豆仅因冷冻、罐装、煮制或冲洗不同，合并为青豌豆；裂豆和发芽豌豆保留独立身份。",
    },
    {
        "group_id": "pinto_bean_preparation",
        "label_zh": "斑豆",
        "retained_concept_id": "ingredient_usda_6290c11c5c286ab9c5b6",
        "concept_ids": ("ingredient_usda_6290c11c5c286ab9c5b6", "ingredient_usda_295010784361a9605657"),
        "rule_zh": "同一斑豆仅因生食/罐装不同，合并为斑豆。",
    },
    {
        "group_id": "canadian_bacon_preparation",
        "label_zh": "加拿大培根",
        "retained_concept_id": "ingredient_usda_df47baa0860b42dfbd15",
        "concept_ids": ("ingredient_usda_df47baa0860b42dfbd15", "ingredient_usda_341584d9139fad6a7db7"),
        "rule_zh": "同一加拿大培根仅因品牌和未准备状态不同，合并为加拿大培根。",
    },
    {
        "group_id": "savoy_cabbage_preparation",
        "label_zh": "皱叶甘蓝",
        "retained_concept_id": "ingredient_usda_a37aed32175c2012c441",
        "concept_ids": ("ingredient_usda_a37aed32175c2012c441", "ingredient_usda_4aec4ee756b4beeca529"),
        "rule_zh": "同一皱叶甘蓝仅因生食/煮制不同，合并为皱叶甘蓝。",
    },
    {
        "group_id": "common_cabbage_preparation",
        "label_zh": "普通甘蓝",
        "retained_concept_id": "ingredient_usda_0c81f33397b9ad6ead8a",
        "concept_ids": ("ingredient_usda_0c81f33397b9ad6ead8a", "ingredient_usda_d68ac1b30f3fdb527c4b"),
        "rule_zh": "同一普通甘蓝仅因生食/煮制不同，合并为普通甘蓝。",
    },
    {
        "group_id": "sunflower_seed_preparation",
        "label_zh": "葵花籽仁",
        "retained_concept_id": "ingredient_usda_2bb1caf6db6687141dd6",
        "concept_ids": (
            "ingredient_usda_2bb1caf6db6687141dd6", "ingredient_usda_0f378c24323fad0df1fe",
            "ingredient_usda_b3fa84f3a38e8a0ae741",
        ),
        "rule_zh": "同一葵花籽仁仅因生食、干制或烘烤不同，合并为葵花籽仁。",
    },
    {
        "group_id": "pumpkin_seed_preparation",
        "label_zh": "南瓜籽仁",
        "retained_concept_id": "ingredient_usda_d9788c64f476aea33db9",
        "concept_ids": ("ingredient_usda_d9788c64f476aea33db9", "ingredient_usda_63f361ebd3b1961e490f"),
        "rule_zh": "同一南瓜籽仁仅因生食/干制不同，合并为南瓜籽仁。",
    },
    {
        "group_id": "portabella_mushroom_preparation",
        "label_zh": "波特贝勒蘑菇",
        "retained_concept_id": "ingredient_usda_8ae167f78ccc9c5f0099",
        "concept_ids": ("ingredient_usda_8ae167f78ccc9c5f0099", "ingredient_usda_d4cf92b4fa5f3ea2296f"),
        "rule_zh": "同一波特贝勒蘑菇仅因紫外线处理不同，合并为波特贝勒蘑菇。",
    },
    {
        "group_id": "napa_cabbage_preparation",
        "label_zh": "大白菜",
        "retained_concept_id": "ingredient_usda_b2e5b83b93c98ffa4a84",
        "concept_ids": ("ingredient_usda_b2e5b83b93c98ffa4a84", "ingredient_usda_e0d251ef5140434e0e1b"),
        "rule_zh": "同一大白菜仅因生食/煮制不同，合并为大白菜。",
    },
    {
        "group_id": "vanilla_soy_yogurt_serving_size",
        "label_zh": "香草豆乳酸奶",
        "retained_concept_id": "ingredient_usda_0ac3b673ec6e698c575f",
        "concept_ids": ("ingredient_usda_0ac3b673ec6e698c575f", "ingredient_usda_7cff4dd73134d40f41a3"),
        "rule_zh": "同一香草豆乳酸奶仅因单份/家庭装不同，合并为香草豆乳酸奶。",
    },
    {
        "group_id": "canola_oil_use_description",
        "label_zh": "菜籽油",
        "retained_concept_id": "ingredient_canola_oil",
        "concept_ids": ("ingredient_canola_oil", "ingredient_usda_eeef6a9f4b086e8543b6"),
        "rule_zh": "同一菜籽油仅因用途写成 salad/wok/light frying 不同，合并为菜籽油。",
    },
    {
        "group_id": "straw_mushroom_preparation",
        "label_zh": "草菇",
        "retained_concept_id": "ingredient_controlled_735dcd75a186c543",
        "concept_ids": ("ingredient_controlled_735dcd75a186c543", "ingredient_usda_6814c68c4e577806c61e"),
        "rule_zh": "同一草菇仅因罐装状态不同，合并为草菇。",
    },
    {
        "group_id": "green_mung_sprout_preparation",
        "label_zh": "绿豆芽",
        "retained_concept_id": "ingredient_stage4_36427b57cff86836",
        "concept_ids": ("ingredient_stage4_36427b57cff86836", "ingredient_usda_0d8a0352610f78e70a7a"),
        "rule_zh": "同一绿豆芽仅因生食/罐装不同，合并为绿豆芽。",
    },
    {
        "group_id": "black_bean_preparation",
        "label_zh": "黑豆",
        "retained_concept_id": "ingredient_stage4_40ed07c0bf135492",
        "concept_ids": ("ingredient_stage4_40ed07c0bf135492", "ingredient_usda_523a0f317da15b06802c", "ingredient_usda_aca083a7d01099ff9a5d"),
        "rule_zh": "同一黑豆仅因 black/black turtle 来源表述不同，合并为黑豆。",
    },
    {
        "group_id": "snow_pea_preparation",
        "label_zh": "荷兰豆",
        "retained_concept_id": "ingredient_stage4_f530ae90343a12a3",
        "concept_ids": ("ingredient_stage4_f530ae90343a12a3", "ingredient_usda_6fa268ec3762af16f252"),
        "rule_zh": "同一荷兰豆仅因生食/冷冻熟制不同，合并为荷兰豆。",
    },
    {
        "group_id": "baked_bean_preparation",
        "label_zh": "焗豆",
        "retained_concept_id": "ingredient_usda_0e3c3e598c96530efefa",
        "concept_ids": (
            "ingredient_usda_0e3c3e598c96530efefa", "ingredient_usda_2e3552a50e038c8e01cb", "ingredient_usda_ceeaf643e1dc3c01b32e",
        ),
        "rule_zh": "同一 plain/no-salt/home-prepared 焗豆仅因准备和罐装状态不同，合并为焗豆。",
    },
    {
        "group_id": "mahi_mahi_preparation",
        "label_zh": "鲯鳅",
        "retained_concept_id": "ingredient_usda_f021b78da1263b18fcc3",
        "concept_ids": ("ingredient_usda_f021b78da1263b18fcc3", "ingredient_usda_5ce7cd4bdfc450ac348f"),
        "rule_zh": "同一鲯鳅仅因生食/冷冻不同，合并为鲯鳅。",
    },
    {
        "group_id": "high_oleic_canola_oil",
        "label_zh": "高油酸菜籽油",
        "retained_concept_id": "ingredient_usda_5ff8e3c1ebaa0a64d76c",
        "concept_ids": ("ingredient_usda_5ff8e3c1ebaa0a64d76c", "ingredient_usda_ebf544dba0a00a2b697c"),
        "rule_zh": "同一高油酸菜籽油仅因产品名和工业用途描述不同，合并为高油酸菜籽油。",
    },
)


def apply_curation_actions(
    catalog: dict[str, Any], actions: dict[str, dict[str, str]]
) -> dict[str, Any]:
    """把人工审核动作写入标准目录，保留删除和改名的可追溯报告。"""
    items_by_id = {str(item["concept_id"]): item for item in catalog["items"]}
    unknown: list[str] = []
    removed: list[dict[str, str]] = []
    renamed: list[dict[str, str]] = []
    unchanged_renames: list[dict[str, str]] = []
    kept: list[str] = []
    redirects: dict[str, str] = {}
    planned_removed_ids = {
        str(concept_id)
        for concept_id, entry in actions.items()
        if str(entry.get("action", "")) == "remove"
    }

    for concept_id, entry in sorted(actions.items()):
        item = items_by_id.get(str(concept_id))
        if item is None:
            unknown.append(str(concept_id))
            continue
        action = str(entry["action"])
        current_name = str(item["canonical_name_zh"])
        marked_name = str(entry.get("current_name", "")).strip()
        if marked_name and marked_name != current_name:
            raise ValueError(
                f"人工整理标记的当前名称与目录不一致：{concept_id}="
                f"{marked_name!r}，目录为 {current_name!r}"
            )
        if action == "keep":
            kept.append(str(concept_id))
            continue
        if action == "remove":
            redirect_to = str(entry.get("redirect_to", "")).strip()
            if redirect_to:
                if redirect_to == str(concept_id):
                    raise ValueError(f"人工整理重定向不能指向自身：{concept_id}")
                if redirect_to not in items_by_id:
                    raise ValueError(
                        f"人工整理重定向目标不存在：{concept_id} -> {redirect_to}"
                    )
                redirects[str(concept_id)] = redirect_to
                if redirect_to in planned_removed_ids:
                    raise ValueError(
                        f"人工整理重定向目标同时被删除：{concept_id} -> {redirect_to}"
                    )
                target = items_by_id[redirect_to]
                target.setdefault("aliases", []).extend(
                    [current_name, *item.get("aliases", [])]
                )
                for variant in item.get("variants", []):
                    target.setdefault("merged_source_variants", []).append({
                        "source_version": variant.get("source_version"),
                        "fdc_id": int(variant["fdc_id"]),
                        "variant_id": variant.get("variant_id"),
                        "display_name_zh": variant.get("display_name_zh"),
                        "reason": "manual_same_ingredient_nutrient_richness_selection",
                    })
            removed.append({
                "concept_id": str(concept_id),
                "canonical_name_zh": current_name,
                "reason": "manual_catalog_review_remove",
                **({"redirected_to": redirect_to} if redirect_to else {}),
            })
            continue
        if action != "rename":
            raise ValueError(f"未知人工整理动作：{concept_id}={action}")
        new_name = str(entry.get("new_name", "")).strip()
        if not new_name:
            raise ValueError(f"重写名称不能为空：{concept_id}")
        if new_name == current_name:
            unchanged_renames.append({
                "concept_id": str(concept_id),
                "canonical_name_zh": current_name,
                "new_name": new_name,
            })
            continue
        item.setdefault("aliases", []).append(current_name)
        item["canonical_name_zh"] = new_name
        for variant in item.get("variants", []):
            variant["display_name_zh"] = display_name(new_name, variant)
        renamed.append({
            "concept_id": str(concept_id),
            "from": current_name,
            "to": new_name,
            "reason": "manual_catalog_review_rename",
        })

    removed_ids = {entry["concept_id"] for entry in removed}
    if removed_ids:
        catalog["items"] = [item for item in catalog["items"] if str(item["concept_id"]) not in removed_ids]
    integration = deepcopy(catalog.get("complete_usda_integration", {}))
    manual_removed = set(str(value) for value in integration.get("manual_removed_concept_ids", []))
    manual_removed.update(removed_ids)
    integration["manual_removed_concept_ids"] = sorted(manual_removed)
    existing_redirects = {
        str(source): str(target)
        for source, target in integration.get("merged_concept_redirects", {}).items()
    }
    existing_redirects.update(redirects)
    integration["merged_concept_redirects"] = existing_redirects
    catalog["complete_usda_integration"] = integration
    return {
        "contract": CURATION_REVIEW_CONTRACT,
        "marked_count": len(actions),
        "kept_count": len(kept),
        "removed_count": len(removed),
        "renamed_count": len(renamed),
        "unchanged_rename_count": len(unchanged_renames),
        "unknown_concept_count": len(unknown),
        "unknown_concept_ids": unknown,
        "kept_concept_ids": kept,
        "redirects": redirects,
        "removed_concepts": removed,
        "renamed_names": renamed,
        "unchanged_renames": unchanged_renames,
    }


def merge_catalog(
    base: dict[str, Any],
    sqlite_path: Path,
    catalog_version: str,
    curation_actions: dict[str, dict[str, str]] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    sources = source_rows(sqlite_path)
    by_id = {str(item["concept_id"]): item for item in base["items"]}
    changed: list[dict[str, Any]] = []
    unresolved: list[dict[str, str]] = []
    output = deepcopy(base)

    for item in output["items"]:
        source = sources.get(str(item["concept_id"]))
        if source is None:
            raise ValueError(f"目录概念缺少来源：{item['concept_id']}")
        name, method = curated_name(item, source)
        if method == "unchanged" and needs_curation(str(item["canonical_name_zh"]), source["source_version"]):
            unresolved.append({
                "concept_id": str(item["concept_id"]),
                "canonical_name_zh": str(item["canonical_name_zh"]),
                "source_description": str(source["description"]),
            })
        if name != item["canonical_name_zh"]:
            item.setdefault("aliases", []).append(item["canonical_name_zh"])
            changed.append({
                "concept_id": item["concept_id"],
                "from": item["canonical_name_zh"],
                "to": name,
                "source_description": source["description"],
                "method": method,
            })
        if source["localized_name"] and source["localized_name"] != name:
            item.setdefault("aliases", []).append(source["localized_name"])
        item["canonical_name_zh"] = name
        for variant in item.get("variants", []):
            variant["display_name_zh"] = display_name(name, variant)

    redirects: dict[str, str] = {}
    merged: list[dict[str, Any]] = []
    for group in MERGE_GROUPS:
        missing = [concept_id for concept_id in group["concept_ids"] if concept_id not in by_id]
        if missing:
            raise ValueError(f"合并组缺少概念：{group['group_id']}={missing}")
        retained = next(item for item in output["items"] if item["concept_id"] == group["retained_concept_id"])
        member_ids = set(group["concept_ids"])
        removed = [item for item in output["items"] if item["concept_id"] in member_ids and item["concept_id"] != group["retained_concept_id"]]
        retained["canonical_name_zh"] = group["label_zh"]
        retained.setdefault("aliases", [])
        for member in [retained, *removed]:
            retained["aliases"].extend([member["canonical_name_zh"], *member.get("aliases", [])])
            for variant in member.get("variants", []):
                if member["concept_id"] == retained["concept_id"]:
                    continue
                retained.setdefault("merged_source_variants", []).append({
                    "source_version": variant["source_version"],
                    "fdc_id": int(variant["fdc_id"]),
                    "variant_id": variant["variant_id"],
                    "display_name_zh": variant["display_name_zh"],
                    "reason": "same_ingredient_different_preparation_or_source_wording",
                })
            if member["concept_id"] != retained["concept_id"]:
                redirects[member["concept_id"]] = retained["concept_id"]
        retained["aliases"] = list(dict.fromkeys(alias for alias in retained["aliases"] if alias and alias != retained["canonical_name_zh"]))
        retained["variants"][0]["display_name_zh"] = display_name(retained["canonical_name_zh"], retained["variants"][0])
        merged.append({
            "group_id": group["group_id"],
            "label_zh": group["label_zh"],
            "retained_concept_id": retained["concept_id"],
            "removed_concept_ids": sorted(redirects[concept_id] and concept_id for concept_id in member_ids if concept_id != retained["concept_id"]),
            "rule_zh": group["rule_zh"],
        })

    output["items"] = [item for item in output["items"] if item["concept_id"] not in redirects]
    alias_conflicts = sanitize_aliases(output["items"])
    curation_report = apply_curation_actions(output, curation_actions or {})
    alias_conflicts.extend(sanitize_aliases(output["items"]))
    output["catalog_version"] = catalog_version
    output["catalog_schema_version"] = 2
    output["name_normalization"] = {
        "contract": CONTRACT,
        "base_catalog_version": str(base["catalog_version"]),
        "rule_zh": "优先按英文来源身份重组为简洁中文名；只有同一基础食材且差异仅为烹饪、保存或来源词序时才合并，营养身份不同的食材不重定向。",
        "changed_name_count": len(changed),
        "merged_concept_count": len(redirects),
        "alias_conflict_count": len(alias_conflicts),
        "dropped_conflicting_aliases": alias_conflicts,
        "merged_groups": merged,
        "redirects": redirects,
        "manual_curation_review": curation_report,
    }
    integration = deepcopy(output.get("complete_usda_integration", {}))
    existing_redirects = dict(integration.get("merged_concept_redirects", {}))
    existing_redirects.update(redirects)
    integration["merged_concept_redirects"] = existing_redirects
    integration["name_normalization_contract"] = CONTRACT
    integration["name_normalization_base_catalog_version"] = str(base["catalog_version"])
    output["complete_usda_integration"] = integration

    report = {
        "contract": CONTRACT,
        "catalog_version": catalog_version,
        "base_catalog_version": str(base["catalog_version"]),
        "base_concept_count": len(base["items"]),
        "catalog_concept_count": len(output["items"]),
        "removed_concept_count": len(redirects),
        "changed_name_count": len(changed),
        "merged_concept_count": len(redirects),
        "alias_conflict_count": len(alias_conflicts),
        "dropped_conflicting_aliases": alias_conflicts,
        "changed_names": changed,
        "merged_groups": merged,
        "groups": [
            {
                "group_id": group["group_id"],
                "label_zh": group["label_zh"],
                "before_count": len(group["concept_ids"]),
                "retained_count": 1,
                "removed_count": len(group["concept_ids"]) - 1,
                "representative_concept_ids": [group["retained_concept_id"]],
                "rule_zh": group["rule_zh"],
            }
            for group in MERGE_GROUPS
        ],
        "redirects": redirects,
        "removed_concepts": [
            {
                "concept_id": source_id,
                "canonical_name_zh": by_id[source_id]["canonical_name_zh"],
                "redirected_to": target_id,
                "reason": "same_ingredient_different_preparation_or_source_wording",
            }
            for source_id, target_id in sorted(redirects.items())
        ],
        "unmodified_machine_translation_candidates": unresolved,
        "manual_curation_review": curation_report,
    }
    return output, report


def apply_curation_release(
    base: dict[str, Any], catalog_version: str, actions: dict[str, dict[str, str]]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """基于已经生成的目录快照应用人工去掉 / 改名标记。"""
    output = deepcopy(base)
    curation_report = apply_curation_actions(output, actions)
    if curation_report["unknown_concept_ids"]:
        raise ValueError(
            "人工整理标记包含当前目录不存在的概念："
            + ", ".join(curation_report["unknown_concept_ids"][:8])
        )
    alias_conflicts = sanitize_aliases(output["items"])
    output["catalog_version"] = catalog_version
    output["catalog_schema_version"] = 2
    name_normalization = deepcopy(output.get("name_normalization", {}))
    name_normalization["manual_curation_review"] = curation_report
    name_normalization["alias_conflict_count"] = len(alias_conflicts)
    name_normalization["dropped_conflicting_aliases"] = alias_conflicts
    output["name_normalization"] = name_normalization
    report = {
        "contract": CURATION_REVIEW_CONTRACT,
        "catalog_version": catalog_version,
        "base_catalog_version": str(base["catalog_version"]),
        "base_concept_count": len(base["items"]),
        "catalog_concept_count": len(output["items"]),
        "removed_concept_count": curation_report["removed_count"],
        "changed_name_count": curation_report["renamed_count"],
        "merged_concept_count": len(curation_report["redirects"]),
        "alias_conflict_count": len(alias_conflicts),
        "dropped_conflicting_aliases": alias_conflicts,
        "manual_curation_review": curation_report,
        "unmodified_machine_translation_candidates": list(
            base.get("name_normalization", {}).get("unmodified_machine_translation_candidates", [])
        ),
    }
    return output, report


def main() -> int:
    args = parse_args()
    targets = (args.out_catalog, args.out_report)
    try:
        if any(path.exists() for path in targets):
            raise ValueError("拒绝覆盖已有目录产物")
        base = load_json(args.base_catalog)
        if not isinstance(base.get("items"), list) or not base["items"]:
            raise ValueError("基础目录 items 必须是非空数组")
        curation_actions = load_curation_review(args.review_markings)
        if args.review_markings:
            catalog, report = apply_curation_release(base, args.catalog_version, curation_actions)
        else:
            if args.sqlite is None:
                raise ValueError("首次生成目录时必须提供 --sqlite；应用人工标记时请提供 --review-markings")
            catalog, report = merge_catalog(base, args.sqlite, args.catalog_version)
        args.out_catalog.parent.mkdir(parents=True, exist_ok=True)
        args.out_report.parent.mkdir(parents=True, exist_ok=True)
        args.out_catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        args.out_report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "catalog_version": args.catalog_version,
            "base_concepts": report["base_concept_count"],
            "catalog_concepts": report["catalog_concept_count"],
            "changed_names": report["changed_name_count"],
            "merged_concepts": report["merged_concept_count"],
            "manual_removed_concepts": report["manual_curation_review"]["removed_count"],
            "manual_renamed_names": report["manual_curation_review"]["renamed_count"],
            "remaining_candidates": len(report.get("unmodified_machine_translation_candidates", [])),
        }, ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ValueError, KeyError, json.JSONDecodeError) as error:
        for path in targets:
            path.unlink(missing_ok=True)
        print(f"食材目录名称整理失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
