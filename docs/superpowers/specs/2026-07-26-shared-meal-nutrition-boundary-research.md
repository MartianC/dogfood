# “和狗狗一起吃”营养责任边界研究

**日期：** 2026-07-26

**研究问题：** 当狗狗每天大部分主食来自家庭人饭菜单中挑选的基础食材，并以适合狗狗的方式单独烹饪时，首版产品仅做单餐能量与营养密度评估，应如何界定产品责任？

## 1. 结论

1. 国标、FEDIAF 和 AAFCO 的营养要求可以作为单餐能量与营养密度的参考对照，但数据库计算结果本身不能证明某顿家庭自制餐或其长期重复喂养“完整均衡”。
2. 长期以家庭自制餐作为主要营养来源，比偶尔补充或零食具有更高的营养失衡风险。权威指南建议由具备资质的兽医营养专业人士制定并定期复核长期家庭自制配方。
3. 首版可以继续允许营养不足、部分数据缺失或食材品类单一的单餐保存，但必须同时保留具体评估结果，并明确“保存记录不代表系统认定本餐完整均衡”。
4. 首版只做单餐评估时，不得把单餐结论外推为每日、连续多日或长期饮食结论。记录应保留输入与版本快照，为后续跨餐聚合提供可追溯数据。

## 2. 证据

### 2.1 “完整均衡”针对完整日粮或可作为唯一饮食的产品

- FDA 说明，标注为 “complete and balanced” 的宠物食品预期可以作为唯一饮食，并需满足 AAFCO 营养档案或通过 AAFCO 饲喂试验。该声明不是由单项营养素对照自动获得。[FDA：Complete and Balanced Pet Food](https://www.fda.gov/animal-veterinary/animal-health-literacy/complete-and-balanced-pet-food)
- AAFCO 将 “complete” 解释为包含所需全部营养素，将 “balanced” 解释为营养素比例正确，并要求营养充足声明对应物种和生命阶段。[AAFCO：Reading Labels](https://www.aafco.org/consumers/understanding-pet-food/reading-labels/)
- FEDIAF 2025 指南将完整宠物食品和补充性宠物食品分开处理；当产品需要与家庭中的其他食物组合形成完整饲粮时，应评估组合后的每日总饲粮，而不是只评估其中一个组成部分。[FEDIAF Nutritional Guidelines 2025](https://www.europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025.pdf)
- 中国现行推荐性标准 `GB/T 31216-2014` 的对象是“全价宠物食品 犬粮”，不能直接等同于未经生产、检验和饲喂验证的家庭自制单餐。[国家标准全文公开系统：GB/T 31216-2014](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=A8758F9C4633B2CCBEE9C82CC3F4A4D1&refer=outter)

### 2.2 长期家庭自制饮食需要更强的专业约束

- AAHA 汇总的研究显示，书籍和网站上的多数家庭自制配方不能提供完整均衡营养；如采用家庭自制饮食，建议咨询具备资质的兽医营养专业人士，并严格遵循包含维生素、矿物质和氨基酸补充在内的配方。[AAHA：Home-prepared Diets](https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-management-guidelines/home-prepared-diets/)
- AAHA 对健康犬猫的喂养建议指出，完整均衡营养的主要来源宜占总摄入的大部分，零食、餐桌食物和其他附加食物只占较小部分。这说明当家庭自制餐成为主要能量来源时，不能继续按“偶尔补充”处理。[AAHA：Feeding Plans for Healthy, Appropriate Weight Cats and Dogs](https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-management-guidelines/feeding-plans-for-healthy-appropriate-weight-cats-and-dogs/)
- AAFCO 说明家庭自制食物不受其宠物食品监管体系覆盖，完整配方涉及大量按能量基准表达的营养参数；食材看似含有某些营养素，不代表组合已经满足全部要求和正确比例。[AAFCO：Frequently Asked Questions](https://www.aafco.org/consumers/understanding-pet-food/frequently-asked-questions)

### 2.3 中国宠物饲料监管标准不能直接为家庭自制餐背书

- 农业农村部公告第 20 号及配套文件面向宠物饲料产品的生产、许可、标签和卫生管理。家庭自制单餐不经过同一套生产与检验流程，因此只能把相关标准作为参考，不能在产品文案中暗示已获得监管意义上的“全价”认定。[中华人民共和国农业农村部公告第 20 号](https://nyncw.sh.gov.cn/nybgfxwj/20180824/0009-105085.html)

## 3. 证据局限

- 上述官方标准和指南主要面向商业宠物食品、完整日粮或兽医营养管理，不直接规定本小程序的交互和保存流程。
- 营养数据库可能存在缺项、形态差异、烹饪损失、生物利用率和实际称量误差；仅按数据库数值计算不能替代成品检测或饲喂验证。
- 单餐偏低不必然代表全天或长期不足；反过来，单餐接近参考值也不能证明长期饮食完整。
- 本研究不提供疾病、妊娠、哺乳、减重、增重或治疗性饮食建议。

## 4. 对 PRD 的约束

以下属于证据支持的事实边界：

- 不得把单餐数据库评估描述为“完整均衡认证”。
- 不得把单餐结果外推为连续多餐或长期结论。
- 当家庭自制餐长期占主要饮食时，需要提示用户寻求兽医或兽医营养专业指导。
- 评估必须如实暴露营养缺口、超量项和数据不足。

以下属于需要人决定的产品规则：

- 营养不足时是否允许保存。
- 保存前警示采用提示、确认还是阻断。
- 哪些提示常驻显示，哪些只在评估详情或首次使用时显示。
- 首版是否只评估单餐，以及何时增加连续多餐聚合。

当前 Brief 已明确的产品决定是：首版只做单餐评估；营养不足不阻止保存；保存结果是一条本餐记录；连续多餐聚合留作后续能力。PRD 仍需明确保存前的警示层级和可验证文案。
