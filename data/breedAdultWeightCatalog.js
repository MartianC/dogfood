const BREED_CATALOG_VERSION = '2026-08-19.v2'
const ESTIMATE_POLICY = 'approved-product-single-point'
const AKC_WEIGHT_CHART_URL = 'https://www.akc.org/expert-advice/nutrition/breed-weight-chart/'
const AKC_TITLE = 'AKC Breed Weight Chart'

// 字段说明：
// value               品种唯一标识（kebab-case），被档案、能量估算等服务消费
// label               中文显示名
// expectedAdultWeightKg  预计成年体重（kg），用于份量换算；为 null 时表示无法估算
// sourceUrl/sourceTitle/sourceWeightRange/estimatePolicy  可审计的数据来源与口径
//
// 体重来源优先采用 AKC 成年体重区间的中值（已换算为 kg，四舍五入到 0.5）。
// 中华田园犬等无 AKC 标准的品种标记为“通用参考（估算）”。
const breedAdultWeightCatalog = [
  // ===== 超小型 / 玩具犬（< 5 kg）=====
  {
    value: 'chihuahua',
    label: '吉娃娃',
    pinyinInitial: 'J',
    expectedAdultWeightKg: 2.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: 'up to 6 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'yorkshire-terrier',
    label: '约克夏梗',
    pinyinInitial: 'Y',
    expectedAdultWeightKg: 2.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '4–7 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'pomeranian',
    label: '博美犬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 2.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '3–7 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'toy-poodle',
    label: '玩具贵宾犬（泰迪）',
    pinyinInitial: 'W',
    expectedAdultWeightKg: 2.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '4–6 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'maltese',
    label: '马尔济斯犬',
    pinyinInitial: 'M',
    expectedAdultWeightKg: 3,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: 'up to 7 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'papillon',
    label: '蝴蝶犬',
    pinyinInitial: 'H',
    expectedAdultWeightKg: 3.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '5–10 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'miniature-pinscher',
    label: '迷你杜宾犬（迷你品）',
    pinyinInitial: 'M',
    expectedAdultWeightKg: 4,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '8–10 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'japanese-chin',
    label: '日本狆',
    pinyinInitial: 'R',
    expectedAdultWeightKg: 4,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '7–11 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'havanese',
    label: '哈瓦那犬',
    pinyinInitial: 'H',
    expectedAdultWeightKg: 4.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '7–13 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'chinese-crested',
    label: '中国冠毛犬',
    pinyinInitial: 'Z',
    expectedAdultWeightKg: 4.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '8–12 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'italian-greyhound',
    label: '意大利灵缇',
    pinyinInitial: 'Y',
    expectedAdultWeightKg: 5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '8–14 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'coton-de-tulear',
    label: '卷毛比雄犬',
    pinyinInitial: 'J',
    expectedAdultWeightKg: 5.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '9–15 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'miniature-poodle',
    label: '迷你贵宾犬',
    pinyinInitial: 'M',
    expectedAdultWeightKg: 5.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '10–15 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  // ===== 小型犬（5–10 kg）=====
  {
    value: 'bichon-frise',
    label: '比熊犬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 6.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '12–18 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'shih-tzu',
    label: '西施犬',
    pinyinInitial: 'X',
    expectedAdultWeightKg: 6,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '9–16 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'pug',
    label: '巴哥犬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 7,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '14–18 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'pekingese',
    label: '北京犬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 6,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: 'up to 14 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'cavalier-king-charles',
    label: '骑士查理王犬',
    pinyinInitial: 'Q',
    expectedAdultWeightKg: 7,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '13–18 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'miniature-schnauzer',
    label: '迷你雪纳瑞',
    pinyinInitial: 'M',
    expectedAdultWeightKg: 7,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '11–20 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'cairn-terrier',
    label: '凯恩梗',
    pinyinInitial: 'K',
    expectedAdultWeightKg: 6,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '13–14 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'west-highland-white-terrier',
    label: '西高地白梗',
    pinyinInitial: 'X',
    expectedAdultWeightKg: 8,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '13–22 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'scottish-terrier',
    label: '苏格兰梗',
    pinyinInitial: 'S',
    expectedAdultWeightKg: 9,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '18–22 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'boston-terrier',
    label: '波士顿梗',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 8.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '12–25 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'french-bulldog',
    label: '法国斗牛犬',
    pinyinInitial: 'F',
    expectedAdultWeightKg: 12,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: 'under 28 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'lhasa-apso',
    label: '拉萨犬',
    pinyinInitial: 'L',
    expectedAdultWeightKg: 6.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '12–18 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'tibetan-spaniel',
    label: '西藏猎犬',
    pinyinInitial: 'X',
    expectedAdultWeightKg: 6,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '9–15 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'schipperke',
    label: '舒柏奇犬',
    pinyinInitial: 'S',
    expectedAdultWeightKg: 6,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '10–16 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'welsh-terrier',
    label: '威尔士梗',
    pinyinInitial: 'W',
    expectedAdultWeightKg: 9.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '20–22 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'border-terrier',
    label: '边境梗',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 6,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '11.5–15.5 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'norwich-terrier',
    label: '诺威奇梗',
    pinyinInitial: 'N',
    expectedAdultWeightKg: 5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '11–12 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'australian-terrier',
    label: '澳洲梗',
    pinyinInitial: 'A',
    expectedAdultWeightKg: 6,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '12–14 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'silky-terrier',
    label: '丝毛梗',
    pinyinInitial: 'S',
    expectedAdultWeightKg: 4,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '8–10 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'affenpinscher',
    label: '猴面梗',
    pinyinInitial: 'H',
    expectedAdultWeightKg: 4,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '7–10 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'brussels-griffon',
    label: '布鲁塞尔格里芬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 4,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '8–10 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'tibetan-terrier',
    label: '西藏梗',
    pinyinInitial: 'X',
    expectedAdultWeightKg: 11,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '18–30 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  // ===== 中型犬（10–25 kg）=====
  {
    value: 'beagle',
    label: '比格犬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 11,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '20–30 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'shiba-inu',
    label: '柴犬',
    pinyinInitial: 'C',
    expectedAdultWeightKg: 10.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '17–23 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'corgi',
    label: '柯基犬（彭布罗克）',
    pinyinInitial: 'K',
    expectedAdultWeightKg: 13,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: 'up to 30 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'cardigan-welsh-corgi',
    label: '柯基犬（卡迪根）',
    pinyinInitial: 'K',
    expectedAdultWeightKg: 14,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '25–38 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'basenji',
    label: '巴仙吉犬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 10.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '22–24 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'bulldog',
    label: '英国斗牛犬',
    pinyinInitial: 'Y',
    expectedAdultWeightKg: 20,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '40–50 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'american-eskimo',
    label: '美国爱斯基摩犬（标准）',
    pinyinInitial: 'M',
    expectedAdultWeightKg: 13.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '25–35 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'samoyed',
    label: '萨摩耶犬',
    pinyinInitial: 'S',
    expectedAdultWeightKg: 23,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '35–65 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'siberian-husky',
    label: '西伯利亚哈士奇',
    pinyinInitial: 'X',
    expectedAdultWeightKg: 22,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '35–60 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'border-collie',
    label: '边境牧羊犬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 19,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '30–55 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'australian-shepherd',
    label: '澳大利亚牧羊犬',
    pinyinInitial: 'A',
    expectedAdultWeightKg: 24,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '40–65 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'english-springer-spaniel',
    label: '英国史宾格犬',
    pinyinInitial: 'Y',
    expectedAdultWeightKg: 20,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '40–50 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'cocker-spaniel',
    label: '可卡犬',
    pinyinInitial: 'K',
    expectedAdultWeightKg: 12.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '25–30 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'welsh-springer-spaniel',
    label: '威尔士史宾格犬',
    pinyinInitial: 'W',
    expectedAdultWeightKg: 20,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '35–55 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'brittany',
    label: '布列塔尼犬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 16,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '30–40 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'shetland-sheepdog',
    label: '喜乐蒂牧羊犬',
    pinyinInitial: 'X',
    expectedAdultWeightKg: 7.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '14–18 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'collie',
    label: '苏格兰牧羊犬',
    pinyinInitial: 'S',
    expectedAdultWeightKg: 26,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '40–75 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'old-english-sheepdog',
    label: '古代英国牧羊犬',
    pinyinInitial: 'G',
    expectedAdultWeightKg: 36,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '60–100 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'standard-schnauzer',
    label: '标准雪纳瑞',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 18,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '30–50 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'soft-coated-wheaten-terrier',
    label: '软毛麦色梗',
    pinyinInitial: 'R',
    expectedAdultWeightKg: 16,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '30–40 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'portuguese-water-dog',
    label: '葡萄牙水犬',
    pinyinInitial: 'P',
    expectedAdultWeightKg: 22,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '35–60 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'vizsla',
    label: '维兹拉犬',
    pinyinInitial: 'W',
    expectedAdultWeightKg: 24,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '44–60 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'weimaraner',
    label: '魏玛犬',
    pinyinInitial: 'W',
    expectedAdultWeightKg: 33,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '55–90 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'german-shorthaired-pointer',
    label: '德国短毛指示犬',
    pinyinInitial: 'D',
    expectedAdultWeightKg: 26,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '45–70 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'whippet',
    label: '惠比特犬',
    pinyinInitial: 'H',
    expectedAdultWeightKg: 15,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '25–40 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'shar-pei',
    label: '沙皮犬',
    pinyinInitial: 'S',
    expectedAdultWeightKg: 24,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '45–60 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'chow-chow',
    label: '松狮犬',
    pinyinInitial: 'S',
    expectedAdultWeightKg: 26,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '45–70 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'dalmatian',
    label: '大麦町犬（斑点狗）',
    pinyinInitial: 'D',
    expectedAdultWeightKg: 25,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '40–70 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'staffordshire-bull-terrier',
    label: '斯塔福郡斗牛梗',
    pinyinInitial: 'S',
    expectedAdultWeightKg: 14,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '24–38 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'keeshond',
    label: '荷兰毛狮犬',
    pinyinInitial: 'H',
    expectedAdultWeightKg: 18,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '35–45 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'airedale-terrier',
    label: '万能梗',
    pinyinInitial: 'W',
    expectedAdultWeightKg: 27,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '50–70 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'borzoi',
    label: '俄罗斯猎狼犬',
    pinyinInitial: 'E',
    expectedAdultWeightKg: 37,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '60–105 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'afghan-hound',
    label: '阿富汗猎犬',
    pinyinInitial: 'A',
    expectedAdultWeightKg: 25,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '50–60 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'saluki',
    label: '萨卢基犬',
    pinyinInitial: 'S',
    expectedAdultWeightKg: 23,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '40–60 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'ibizan-hound',
    label: '伊比赞猎犬',
    pinyinInitial: 'Y',
    expectedAdultWeightKg: 21,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '45–50 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'greyhound',
    label: '灵缇',
    pinyinInitial: 'L',
    expectedAdultWeightKg: 29,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '55–70 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'standard-poodle',
    label: '标准贵宾犬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 25,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '40–70 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  // ===== 大型犬（25 kg 以上）=====
  {
    value: 'akita',
    label: '秋田犬',
    pinyinInitial: 'Q',
    expectedAdultWeightKg: 45,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '70–130 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'boxer',
    label: '拳师犬',
    pinyinInitial: 'Q',
    expectedAdultWeightKg: 30,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '50–80 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'doberman-pinscher',
    label: '杜宾犬',
    pinyinInitial: 'D',
    expectedAdultWeightKg: 36,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '60–100 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'rottweiler',
    label: '罗威纳犬',
    pinyinInitial: 'L',
    expectedAdultWeightKg: 38,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '80–135 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'german-shepherd',
    label: '德国牧羊犬',
    pinyinInitial: 'D',
    expectedAdultWeightKg: 34,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '50–90 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'golden-retriever',
    label: '金毛寻回犬',
    pinyinInitial: 'J',
    expectedAdultWeightKg: 30,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '55–75 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'labrador-retriever',
    label: '拉布拉多犬',
    pinyinInitial: 'L',
    expectedAdultWeightKg: 30,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '55–80 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'chesapeake-bay-retriever',
    label: '切萨皮克湾寻回犬',
    pinyinInitial: 'Q',
    expectedAdultWeightKg: 31,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '55–80 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'flat-coated-retriever',
    label: '平毛寻回犬',
    pinyinInitial: 'P',
    expectedAdultWeightKg: 31,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '55–80 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'nova-scotia-duck-tolling-retriever',
    label: '新斯科舍诱鸭寻回犬',
    pinyinInitial: 'X',
    expectedAdultWeightKg: 20,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '37–51 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'irish-setter',
    label: '爱尔兰塞特犬',
    pinyinInitial: 'A',
    expectedAdultWeightKg: 28,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '55–70 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'english-setter',
    label: '英国塞特犬',
    pinyinInitial: 'Y',
    expectedAdultWeightKg: 28,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '45–80 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'gordon-setter',
    label: '戈登塞特犬',
    pinyinInitial: 'G',
    expectedAdultWeightKg: 28,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '45–80 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'giant-schnauzer',
    label: '巨型雪纳瑞',
    pinyinInitial: 'J',
    expectedAdultWeightKg: 32,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '55–85 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'bouvier-des-flandres',
    label: '佛兰德斯牧牛犬',
    pinyinInitial: 'F',
    expectedAdultWeightKg: 40,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '70–110 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'alaskan-malamute',
    label: '阿拉斯加雪橇犬',
    pinyinInitial: 'A',
    expectedAdultWeightKg: 36,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '75–85 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'cane-corso',
    label: '卡斯罗犬',
    pinyinInitial: 'K',
    expectedAdultWeightKg: 45,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '80–110 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'great-dane',
    label: '大丹犬',
    pinyinInitial: 'D',
    expectedAdultWeightKg: 57,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '99–175 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'great-pyrenees',
    label: '大白熊犬',
    pinyinInitial: 'D',
    expectedAdultWeightKg: 45,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '85+ lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'bernese-mountain-dog',
    label: '伯恩山犬',
    pinyinInitial: 'B',
    expectedAdultWeightKg: 42,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '70–115 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'greater-swiss-mountain-dog',
    label: '大瑞士山地犬',
    pinyinInitial: 'D',
    expectedAdultWeightKg: 51,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '85–140 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'newfoundland',
    label: '纽芬兰犬',
    pinyinInitial: 'N',
    expectedAdultWeightKg: 57,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '100–150 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'saint-bernard',
    label: '圣伯纳犬',
    pinyinInitial: 'S',
    expectedAdultWeightKg: 57,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '100–180 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'mastiff',
    label: '英国獒犬',
    pinyinInitial: 'Y',
    expectedAdultWeightKg: 73,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '120–230 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'neapolitan-mastiff',
    label: '那不勒斯獒',
    pinyinInitial: 'N',
    expectedAdultWeightKg: 52,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '80–150 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'irish-wolfhound',
    label: '爱尔兰猎狼犬',
    pinyinInitial: 'A',
    expectedAdultWeightKg: 51,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '105–120 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'komondor',
    label: '可蒙犬',
    pinyinInitial: 'K',
    expectedAdultWeightKg: 40,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '70+ lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'kuvasz',
    label: '库瓦兹犬',
    pinyinInitial: 'K',
    expectedAdultWeightKg: 42,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: AKC_TITLE,
    sourceWeightRange: '70–115 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  // ===== 中国本土 / 估算品种 =====
  {
    value: 'tibetan-mastiff',
    label: '藏獒',
    pinyinInitial: 'Z',
    expectedAdultWeightKg: 55,
    sourceUrl: '',
    sourceTitle: '通用参考（估算）',
    sourceWeightRange: '45–70 kg（估算）',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'chinese-rural-dog',
    label: '中华田园犬',
    pinyinInitial: 'Z',
    expectedAdultWeightKg: 20,
    sourceUrl: '',
    sourceTitle: '通用参考（估算）',
    sourceWeightRange: '15–25 kg（估算）',
    estimatePolicy: ESTIMATE_POLICY
  },
  // ===== 兜底项（无估算值）=====
  {
    value: 'mixed-or-unknown',
    label: '混血/不确定',
    pinyinInitial: 'H',
    expectedAdultWeightKg: null,
    sourceUrl: '',
    sourceTitle: '',
    sourceWeightRange: '',
    estimatePolicy: ESTIMATE_POLICY
  }
]

module.exports = {
  BREED_CATALOG_VERSION,
  breedAdultWeightCatalog
}
