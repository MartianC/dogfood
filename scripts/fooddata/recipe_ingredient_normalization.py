#!/usr/bin/env python3
"""人饭菜谱原料的低 token 确定性清洗规则。"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass, field
from typing import Iterable


POLICY_ID = "recipeIngredientNormalization/v7"

SEASONING_PATTERN = re.compile(
    "|".join(
        (
            r"盐|鹽|鸡精|味精|味素|鸡粉|鲜味粉|蘑菇精|调味|调料|椒盐|十三香|浓汤宝|高汤粉",
            r"生抽|老抽|酱油|豉油|鼓油|蚝油|蠔油|耗油|鱼露|酒|醋|酱|味噌|豆豉|豆鼓|味达美|美极鲜|鲜贝露|味淋|香草精|汁$",
            r"花椒|胡椒|八角|大料|桂皮|香叶|五香|孜然|咖喱|芥末|香辛|香料",
            r"丁香|肉桂|豆蔻|肉蔻|茴香|辣椒|泡椒|剁椒|牛肉粉",
            r"泰椒|尖椒|干椒|海椒|朝天椒|线椒|树椒|杭椒|湖南椒|红美人椒",
            r"迷迭香|百里香|罗勒|薄荷|紫苏|草果|白芷|当归|甘草|陈皮",
            r"炖肉料|烤肉料|烧烤料|奥尔良腌料|火锅底料|高汤精|蔬之鲜|麻辣鲜|藏红花|色素",
            r"六月鲜|一品鲜|美味鲜|干贝素|蔬菜精|糟卤|火锅料|腌料|奥尔良粉|新奥尔良粉",
            r"月桂叶|桂叶|三奈|三萘|山奈|沙姜粉|黑椒|牛至|法香|欧芹|大茴|小茴|回香",
            r"郫县豆瓣|红油豆瓣|番茄沙司|味极鲜|老干妈|榨菜|腐乳|酸菜|泡菜|辣白菜",
            r"小米椒|小米辣|红米椒|二荆条|野山椒|干红椒|红干椒|藤椒",
            r"白糖|砂糖|冰糖|红糖|糖粉|糖浆|麦芽糖|代糖|蜂蜜|炼乳|甜菊|木糖醇|^糖",
            r"^葱|葱$|大葱|小葱|香葱|葱花|^姜|姜$|生姜",
            r"^蒜|蒜$|大蒜|蒜头|蒜蓉|香菜|芫荽",
        )
    ),
    re.IGNORECASE,
)
OIL_TERMS = {
    "油",
    "生油",
    "黄油",
    "酥油",
    "猪油",
    "牛油",
    "鸡油",
    "鸭油",
    "香油",
    "麻油",
    "色拉油",
    "植物油",
    "食用油",
    "橄榄油",
    "玉米油",
    "花生油",
    "菜籽油",
    "豆油",
    "大豆油",
    "椰子油",
    "葵花籽油",
    "红花籽油",
    "亚麻籽油",
    "核桃油",
    "米糠油",
    "葡萄籽油",
    "茶油",
    "山茶油",
    "棕榈油",
    "调和油",
    "沙拉油",
    "芝麻油",
}
NON_OIL_SUFFIXES = ("奶油",)
GENERIC_TERMS = {
    "鱼",
    "肉",
    "瘦肉",
    "肉末",
    "青菜",
    "蔬菜",
    "海鲜",
    "菌菇",
    "蘑菇",
    "水果",
    "豆类",
    "鸡",
    "鸭",
    "鹅",
    "猪",
    "牛",
    "羊",
    "蛋",
    "肉馅",
    "肉丝",
    "肉片",
    "肉糜",
    "肉沫",
    "碎肉",
    "坚果",
}
AUXILIARY_TERMS = {
    "水": "cooking_auxiliary",
    "酵母": "processing_aid",
    "发酵辅料": "processing_aid",
    "泡打粉": "processing_aid",
    "小苏打": "processing_aid",
    "食用碱": "processing_aid",
    "碱水": "processing_aid",
    "竹签": "non_food_item",
    "模具": "non_food_item",
    "保鲜膜": "non_food_item",
    "油纸": "non_food_item",
    "烤箱": "non_food_item",
    "打蛋器": "non_food_item",
    "寿司帘": "non_food_item",
    "牙签": "non_food_item",
    "棉线": "non_food_item",
    "纱布": "non_food_item",
    "杯子": "non_food_item",
    "玻璃瓶": "non_food_item",
    "豆浆机": "non_food_item",
    "装饰": "recipe_section_label",
    "装饰:": "recipe_section_label",
    "表面装饰": "recipe_section_label",
    "表面装饰:": "recipe_section_label",
    "装饰材料": "recipe_section_label",
    "辅料": "recipe_section_label",
    "辅料:": "recipe_section_label",
    "配料": "recipe_section_label",
    "配料:": "recipe_section_label",
    "主料": "recipe_section_label",
    "适量": "recipe_section_label",
    "无": "recipe_section_label",
}
CONTROLLED_SYNONYMS = {
    "麻椒": "花椒",
    "醬油": "酱油",
    "蔥花": "葱",
    "蔥段": "葱",
    "薑片": "姜",
    "薑末": "姜",
    "白沙糖": "白砂糖",
    "细沙糖": "白砂糖",
    "味增": "味噌",
    "粟米油": "玉米油",
    "鳄梨": "牛油果",
    "冷开水": "水",
    "热水": "水",
    "纯净水": "水",
    "即发酵母粉": "酵母",
    "即发酵母": "酵母",
    "即溶酵母": "酵母",
    "老面": "发酵辅料",
    "酵母粉": "酵母",
    "干酵母": "酵母",
    "发酵粉": "发酵辅料",
    "开水": "水",
    "凉开水": "水",
    "冷水": "水",
    "冰块": "水",
    "凉白开": "水",
    "白开水": "水",
    "温开水": "水",
    "沸水": "水",
    "冰水": "水",
    "矿泉水": "水",
    "饮用水": "水",
    "热开水": "水",
    "白水": "水",
    "凉白开水": "水",
    "温热水": "水",
    "即发干酵母": "酵母",
    "耐高糖酵母": "酵母",
    "安琪酵母": "酵母",
    "无铝泡打粉": "泡打粉",
    "枧水": "碱水",
    "红枣": "枣",
    "马苏里拉芝士": "马苏里拉奶酪",
    "红萝卜": "胡萝卜",
    "豆角": "四季豆",
    "芝士": "奶酪",
    "冬笋": "竹笋",
    "春笋": "竹笋",
    "圣女果": "番茄",
    "马蹄": "荸荠",
    "玉米面": "玉米粉",
    "低粉": "低筋面粉",
    "高粉": "高筋面粉",
    "中粉": "中筋面粉",
    "生粉": "淀粉",
    "清水": "水",
    "温水": "水",
    "凉水": "水",
    "西红柿": "番茄",
    "马铃薯": "土豆",
    "鸡蛋白": "蛋白",
    "蛋清": "蛋白",
    "苏打粉": "小苏打",
    "九层塔": "罗勒",
}
# 菜谱领域约定俗成的裸词省略。只对完整裸词生效，带部位、品牌、状态或复合分隔符的写法不走此映射。
CONTROLLED_BARE_INGREDIENT_DEFAULTS = {
    "瘦肉": "猪肉",
    "肉丝": "猪肉",
    "肉末": "猪肉末",
    "肉馅": "猪肉末",
    "蘑菇": "平菇",
    "豆芽": "黄豆芽",
    "鱼": "鲤鱼",
    "蛋": "鸡蛋",
    "鸡": "鸡肉",
    "里脊肉": "猪里脊",
    "里脊": "猪里脊",
    "精肉": "猪肉",
    "精瘦肉": "猪肉",
}
STATE_IDENTITY_MAPPINGS = {
    "米饭": ("大米", "cooked", "conversion_required"),
    "剩米饭": ("大米", "cooked", "conversion_required"),
    "全蛋液": ("鸡蛋", "raw", "ready"),
    "蛋液": ("鸡蛋", "raw", "ready"),
    "熟芝麻": ("芝麻", "cooked", "conversion_required"),
    "熟白芝麻": ("白芝麻", "cooked", "conversion_required"),
    "熟黑芝麻": ("黑芝麻", "cooked", "conversion_required"),
    "土豆泥": ("土豆", "cooked", "conversion_required"),
    "南瓜泥": ("南瓜", "cooked", "conversion_required"),
    "熟牛腩": ("牛腩", "cooked", "conversion_required"),
    "桂圆肉": ("桂圆", "dried", "conversion_required"),
    "柿饼": ("柿子", "dried", "conversion_required"),
}
TERMINAL_ISOLATIONS = {
    "燕窝": "cfct_exact_insufficient_evidence",
    "香米": "cfct_exact_multiple_equivalent_sources",
    "奶白菜": "cfct_exact_identity_disagreement",
    "珍珠": "cfct_exact_insufficient_evidence",
    "红豆馅": "cfct_exact_variable_processed",
    "脆皮肠": "cfct_exact_variable_processed",
    "阿胶": "cfct_exact_variable_processed",
    "叉烧肉": "cfct_exact_variable_processed",
    "蟹足棒": "cfct_exact_variable_processed",
}
KNOWN_BRANDS = (
    "蒙牛",
    "伊利",
    "安佳",
    "雀巢",
    "总统",
    "妙可蓝多",
)
QUALITY_PREFIXES = ("新鲜", "鲜", "冷冻", "速冻")
STATE_PREFIXES = ("生", "熟", "去皮", "去骨", "带皮", "带骨")
CUT_SUFFIXES = ("切片", "切丝", "切丁", "切块", "片", "丝", "丁", "块", "末", "碎", "段")
PROTECTED_SUFFIXES = ("粉丝", "吐司", "芝士")
SAFE_ANNOTATION_PATTERN = re.compile(
    r"面团|面糊|馅|内馅|装饰|表面|刷面|腌制|焯水|泡发|洗净|切好|备用|"
    r"油酥|水油皮|油皮|派皮|可选|可不放|用$"
)
STATE_ANNOTATIONS = {"生", "熟", "干", "鲜", "冷冻", "速冻", "去皮", "去骨", "带皮", "带骨"}
QUANTITY_SUFFIX_PATTERN = re.compile(
    r"(?:约|大约)?(?:\d+(?:\.\d+)?|[一二两三四五六七八九十半]+)"
    r"(?:kg|g|克|千克|公斤|斤|两|ml|毫升|l|升|个|只|根|条|片|颗|枚|块|杯|勺)$",
    re.IGNORECASE,
)
VAGUE_QUANTITY_PATTERN = re.compile(r"(?:适量|少许|若干|一点|一些)$")
ALTERNATIVE_SPLIT_PATTERN = re.compile(r"(?:或者|或|/)")
COMPOSITE_SPLIT_PATTERN = re.compile(r"[、,，+]|和")


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip().lower()
    return "".join(text.split()).replace("（", "(").replace("）", ")")


@dataclass
class NormalizationResult:
    normalized_name: str
    cleaned_name: str
    status: str
    rule_id: str
    exclusion_category: str | None = None
    concept_id: str | None = None
    components: list[str] = field(default_factory=list)
    quantity_text: str | None = None
    brand: str | None = None
    annotations: list[str] = field(default_factory=list)
    rule_trace: list[str] = field(default_factory=list)
    mention_preparation_state: str | None = None
    nutrition_status: str | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def exclusion_category(value: str) -> str | None:
    normalized = normalize_text(value)
    if SEASONING_PATTERN.search(normalized):
        return "seasoning"
    if normalized in OIL_TERMS or (
        normalized.endswith("油") and not normalized.endswith(NON_OIL_SUFFIXES)
    ):
        return "oil"
    return None


def strip_safe_annotation(value: str, result: NormalizationResult) -> str:
    match = re.search(r"\(([^()]*)\)$", value)
    if not match:
        return value
    annotation = match.group(1).strip()
    if annotation in STATE_ANNOTATIONS or SAFE_ANNOTATION_PATTERN.search(annotation):
        result.annotations.append(annotation)
        result.rule_trace.append("safe_annotation_removed")
        return value[: match.start()]
    return value


def strip_quantity(value: str, result: NormalizationResult) -> str:
    for pattern in (QUANTITY_SUFFIX_PATTERN, VAGUE_QUANTITY_PATTERN):
        match = pattern.search(value)
        if match and match.start() > 0:
            result.quantity_text = match.group(0)
            result.rule_trace.append("quantity_removed")
            return value[: match.start()]
    return value


def candidate_names(value: str, known_names: set[str]) -> tuple[str, list[str], str | None]:
    trace: list[str] = []
    current = CONTROLLED_SYNONYMS.get(value, value)
    if current != value:
        trace.append("controlled_synonym")

    brand = None
    for candidate in KNOWN_BRANDS:
        if current.startswith(candidate):
            remainder = current[len(candidate) :]
            if remainder in known_names:
                brand = candidate
                current = remainder
                trace.append("known_brand_removed")
            break

    for prefix in QUALITY_PREFIXES:
        if current.startswith(prefix) and current[len(prefix) :] in known_names:
            current = current[len(prefix) :]
            trace.append("quality_prefix_removed")
            break
    for prefix in STATE_PREFIXES:
        if current.startswith(prefix) and current[len(prefix) :] in known_names:
            current = current[len(prefix) :]
            trace.append("state_prefix_removed")
            break
    if not current.endswith(PROTECTED_SUFFIXES):
        for suffix in CUT_SUFFIXES:
            if current.endswith(suffix) and current[: -len(suffix)] in known_names:
                current = current[: -len(suffix)]
                trace.append("cut_suffix_removed")
                break
    return current, trace, brand


def clean_single(
    value: str,
    alias_to_concept: dict[str, str],
    source_names: set[str],
    known_names: set[str],
) -> NormalizationResult:
    normalized = normalize_text(value)
    result = NormalizationResult(
        normalized_name=normalized,
        cleaned_name=normalized,
        status="model_candidate",
        rule_id="unresolved_after_deterministic_rules",
    )
    current = strip_quantity(normalized, result)
    current = strip_safe_annotation(current, result)
    state_mapping = STATE_IDENTITY_MAPPINGS.get(current)
    if state_mapping:
        current, result.mention_preparation_state, result.nutrition_status = state_mapping
        result.rule_trace.append("state_identity_mapping")
    current, trace, brand = candidate_names(current, known_names)
    result.rule_trace.extend(trace)
    result.brand = brand
    result.cleaned_name = current
    if not result.nutrition_status:
        state_mapping = STATE_IDENTITY_MAPPINGS.get(current)
        if state_mapping:
            current, result.mention_preparation_state, result.nutrition_status = state_mapping
            result.cleaned_name = current
            result.rule_trace.append("state_identity_mapping_after_candidate_cleanup")

    excluded = exclusion_category(current)
    if excluded:
        result.status = "excluded"
        result.rule_id = f"excluded_{excluded}"
        result.exclusion_category = excluded
        result.rule_trace.append(result.rule_id)
        return result

    if current in AUXILIARY_TERMS:
        result.status = "auxiliary"
        result.rule_id = AUXILIARY_TERMS[current]
        return result
    isolation_reason = TERMINAL_ISOLATIONS.get(current)
    if isolation_reason:
        result.status = "isolated"
        result.rule_id = isolation_reason
        result.rule_trace.append("terminal_model_review_isolation")
        return result
    bare_default = CONTROLLED_BARE_INGREDIENT_DEFAULTS.get(current)
    if bare_default:
        concept_id = alias_to_concept.get(bare_default)
        if concept_id:
            result.status = "matched"
            result.rule_id = "controlled_bare_ingredient_default"
            result.concept_id = concept_id
            result.cleaned_name = bare_default
            result.rule_trace.append("controlled_bare_ingredient_default")
            return result
    concept_id = alias_to_concept.get(current)
    if concept_id:
        result.status = "matched"
        result.rule_id = "deterministic_alias_match"
        result.concept_id = concept_id
        return result
    if current in source_names:
        result.status = "source_candidate"
        result.rule_id = "deterministic_source_name_match"
        return result
    if current in GENERIC_TERMS:
        result.status = "ambiguous"
        result.rule_id = "generic_parent_term"
        return result
    if re.search(r"\([^()]+\)$", current):
        result.status = "ambiguous"
        result.rule_id = "identity_annotation_not_removed"
        return result
    return result


def clean_term(
    value: str,
    alias_to_concept: dict[str, str],
    source_names: Iterable[str],
    known_names: set[str] | None = None,
) -> NormalizationResult:
    normalized = normalize_text(value)
    source_name_set = (
        source_names
        if isinstance(source_names, set)
        else {normalize_text(name) for name in source_names}
    )
    known_name_set = known_names or (set(alias_to_concept) | source_name_set)
    direct = clean_single(
        normalized, alias_to_concept, source_name_set, known_name_set
    )
    if direct.status != "model_candidate":
        return direct

    for status, pattern, rule_id in (
        ("alternative", ALTERNATIVE_SPLIT_PATTERN, "deterministic_alternative_split"),
        ("composite", COMPOSITE_SPLIT_PATTERN, "deterministic_composite_split"),
    ):
        parts = [part for part in pattern.split(normalized) if part]
        if len(parts) < 2:
            continue
        cleaned_parts = [
            clean_single(part, alias_to_concept, source_name_set, known_name_set)
            for part in parts
        ]
        if all(item.status == "matched" for item in cleaned_parts):
            direct.status = status
            direct.rule_id = rule_id
            direct.components = [str(item.concept_id) for item in cleaned_parts]
            direct.rule_trace.append(rule_id)
            return direct
        direct.status = "ambiguous"
        direct.rule_id = f"unresolved_{status}"
        direct.rule_trace.append(direct.rule_id)
        return direct
    return direct
