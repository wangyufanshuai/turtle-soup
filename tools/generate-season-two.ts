import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CaseFile, QueryCorpusEntry, ReasoningBoardMode } from "../packages/mystery-core/src/index.ts";

type Seed = {
  code: string;
  slug: string;
  title: string;
  surface: string;
  truth: string;
  difficulty: "intermediate" | "advanced" | "expert";
  minutes: { min: number; max: number };
  mode: ReasoningBoardMode;
  layout: string;
  palette: string;
  accent: string;
  tags: string[];
  nav: [string, string, string];
  events: string[];
  evidence: Array<[string, string]>;
  keywords: string[];
  alternatives: [string, string];
  motive: string;
  motif: string;
};

const seeds: Seed[] = [
  {
    code: "c13", slug: "second-waterline", title: "空杯里的第二条水线",
    surface: "量杯从未开封，也没有加入液体；清晨的水线却比封存时高出了一截。",
    truth: "升温使蜡扣软化，浸没配重下沉并排开更多液体；总质量与封口始终未变。",
    difficulty: "intermediate", minutes: { min: 8, max: 18 }, mode: "state-trace", layout: "hydrostatic-lab", palette: "oxidized-glass", accent: "#83c7b8",
    tags: ["状态转换", "体积守恒", "测量基准"], nav: ["量杯", "实验记录", "状态链"],
    events: ["研究员封存量杯", "初始水线被刻度相机记录", "恒温台开始缓慢升温", "固定配重的蜡扣逐渐软化", "配重沿导杆完全下沉", "浸没体积随之增加", "水线越过第二条刻度", "封口完整性通过复核", "整套装置总质量保持不变", "染色标带被发现但与水量无关"],
    evidence: [["封口显微照片", "封膜边缘连续，没有针孔、撕裂或重新热封痕迹。"], ["初始刻度帧", "封存时的相机帧清楚标出第一条水线。"], ["恒温台曲线", "台面温度在夜间从16℃缓慢升至24℃。"], ["蜡扣材料单", "这种固定蜡在22℃附近开始失去支撑力。"], ["导杆擦痕", "擦痕从上方固定点一直延伸到量杯底部。"], ["配重浸没照片", "清晨配重完全位于液面以下。"], ["排水体积复算", "配重新增的浸没体积与水线升高量一致。"], ["总质量复核", "封存前后装置总质量差小于仪器误差。"], ["空白加液记录", "夜班记录中没有开启或加液操作。"], ["蓝色标带", "标带只用于区分批次，不吸水也不改变体积。"]],
    keywords: ["封口", "初始水线", "升温", "蜡扣", "配重", "浸没", "排水体积", "总质量", "加液", "蓝色标带"], alternatives: ["有人从封口缝隙加入液体", "液体单纯受热膨胀造成全部变化"], motive: "完成恒温装置的延迟释放测试", motif: "M8 52h72M24 68c18-30 46-30 64 0M54 38v48"
  },
  {
    code: "c14", slug: "moving-red-box", title: "越过但未跨越的红箱",
    surface: "红色行李箱整夜没有移动，也没有通过闸门；清晨它却出现在禁区线的另一侧。",
    truth: "箱子没有跨越固定边界；维护人员沿地轨移动了整段可变隔离线，使边界越过箱子。",
    difficulty: "intermediate", minutes: { min: 8, max: 18 }, mode: "spatial-map", layout: "moving-boundary", palette: "warning-red", accent: "#d36e62",
    tags: ["空间参照系", "移动边界", "负证据"], nav: ["禁区", "维护记录", "空间图"],
    events: ["红箱停在地面定位钉旁", "夜班闸门完成封闭", "地轨维护任务获批", "隔离栏解锁并沿轨道后移", "禁区线越过静止红箱", "隔离栏在新位置重新锁定", "地面定位钉证明箱子未移动", "闸机日志证明箱子未通过", "清晨巡检拍下新边界", "一张旧货签被发现但与移动无关"],
    evidence: [["红箱底部粉尘圈", "箱轮周围的粉尘圈完整，定位钉仍在同一相对位置。"], ["闸门封闭日志", "整夜没有物体通过固定闸门。"], ["地轨维护许可", "许可允许隔离栏在00:20至00:35之间后移四米。"], ["栏杆解锁记录", "维护钥匙只解锁了可移动隔离栏。"], ["轨道磨痕", "新鲜磨痕从旧边界连续延伸到清晨位置。"], ["新锁定位", "隔离栏最终锁在红箱外侧的新卡位。"], ["定位钉测量", "红箱与两枚地钉的距离前后一致。"], ["固定闸机摄像", "画面中红箱从未进入闸机通道。"], ["清晨全景", "照片证明边界位置改变，而非红箱位置改变。"], ["旧货运标签", "标签属于前一周批次，不影响本案空间关系。"]],
    keywords: ["粉尘圈", "闸门", "地轨许可", "栏杆解锁", "轨道磨痕", "新卡位", "定位钉", "闸机画面", "边界位置", "旧货签"], alternatives: ["红箱通过地下通道移动", "有人篡改监控后搬动红箱"], motive: "为清晨大型设备进场扩大维护区", motif: "M8 78h84M24 22h42v42H24zM66 34h18v42"
  },
  {
    code: "c15", slug: "sixth-panorama", title: "同一张合影里的第六个人",
    surface: "天台始终只有五个人，门禁也没有第六次进入；全景合影里却清楚站着六个人。",
    truth: "旋转全景相机分时扫描；同一名快递员在镜头背后移动后，被左右两个扇区各记录一次。",
    difficulty: "intermediate", minutes: { min: 8, max: 18 }, mode: "sampling-window", layout: "panorama-roof", palette: "silver-blue", accent: "#8fb8d4",
    tags: ["分时采样", "合成观察", "身份计数"], nav: ["天台", "影像记录", "采样线"],
    events: ["五人通过门禁抵达天台", "相机从东侧开始旋转扫描", "快递员在东侧扇区第一次入镜", "镜头转向南侧", "快递员从镜头背后走向西侧", "相机扫描西侧扇区", "同一快递员第二次入镜", "软件拼接全部扇区", "门禁复核仍只有五人", "备用三脚架被发现但没有参与拍摄"],
    evidence: [["门禁唯一人数", "五枚不同凭证进入，之后没有新的开门事件。"], ["全景原始扇区", "所谓一张照片由十二个依次拍摄的扇区组成。"], ["东侧衣袖细节", "东侧人物袖口有一道独特的白色修补线。"], ["旋转时间码", "相机扫描每个扇区相差约三秒。"], ["背后移动轨迹", "地面反光记录了快递员从东向西绕行。"], ["西侧鞋带细节", "西侧人物的鞋带结与东侧人物完全一致。"], ["拼接元数据", "软件只对齐背景，没有执行人物去重。"], ["身份特征比对", "袖口、手表和鞋带共同证明两个人影属于同一人。"], ["天台出口日志", "拍摄结束前五人均未离开。"], ["备用三脚架", "三脚架没有相机，也没有留下有效影像。"]],
    keywords: ["门禁人数", "原始扇区", "袖口", "旋转时间码", "移动轨迹", "鞋带", "拼接元数据", "身份比对", "出口日志", "备用三脚架"], alternatives: ["存在未登记的第六个人", "合影被人事后复制粘贴修改"], motive: "在自动全景倒计时内递送文件后归队", motif: "M16 50a34 34 0 1 0 68 0a34 34 0 1 0-68 0M50 16v68M16 50h68"
  },
  {
    code: "c16", slug: "closed-door-handoff", title: "没有开门的交接",
    surface: "证物从甲室转移到了乙室；两扇房门、两套门磁和走廊监控都证明没有开门。",
    truth: "证物通过墙内旋转交接柜完成转移；柜筒每次只向一侧开放，因此两间房门都无需开启。",
    difficulty: "intermediate", minutes: { min: 8, max: 18 }, mode: "provenance-chain", layout: "transfer-vault", palette: "archive-brass", accent: "#c4a46a",
    tags: ["保管链", "空间拓扑", "权限范围"], nav: ["双室", "保管记录", "交接链"],
    events: ["证物在甲室完成封袋", "甲室房门进入持续锁定", "甲侧交接柜门被解锁", "证物放入旋转柜筒", "柜筒旋转一百八十度", "甲侧开口被机械隔离", "乙侧交接柜门解锁", "证物在乙室重新签收", "两侧房门日志均保持关闭", "走廊清洁车经过但未接触墙柜"],
    evidence: [["封袋编号", "乙室签收的封袋编号与甲室封存记录一致。"], ["甲室门磁", "甲室房门整段时间保持关闭。"], ["甲侧柜锁日志", "00:11只有墙内交接柜的小门被解锁。"], ["柜筒容积图", "旋转筒足以容纳封袋，但无法容纳人员。"], ["旋转轴传感器", "00:13记录到一次完整的一百八十度旋转。"], ["机械互锁图", "柜筒不可能同时向甲乙两侧开放。"], ["乙侧柜锁日志", "00:14乙侧小门在甲侧闭合后解锁。"], ["乙室签收表", "签收时间与柜筒旋转完成时间一致。"], ["双门审计", "两扇人员通行门都没有开启。"], ["清洁车记录", "清洁车只沿走廊通过，没有停靠交接柜。"]],
    keywords: ["封袋编号", "甲室门磁", "甲侧柜锁", "柜筒容积", "旋转轴", "机械互锁", "乙侧柜锁", "乙室签收", "双门审计", "清洁车"], alternatives: ["有人藏在甲室内完成转移", "墙体被临时拆开后重新封闭"], motive: "在不破坏双室洁净隔离的条件下移交证物", motif: "M8 18h34v64H8zM58 18h34v64H58zM42 34h16v32H42z"
  },
  {
    code: "c17", slug: "twelve-strikes", title: "十一点的十二声钟",
    surface: "钟楼表盘停在十一点整，维修记录也承认它没有走动；午夜却准确敲了十二声。",
    truth: "表针走时轮系与报时轮系彼此独立；维修只锁住表针，报时轮仍由独立落锤按午夜凸轮运行。",
    difficulty: "advanced", minutes: { min: 10, max: 20 }, mode: "state-trace", layout: "clockwork-tower", palette: "clock-bronze", accent: "#d2a45f",
    tags: ["机械因果", "系统脱耦", "状态机"], nav: ["钟楼", "维修簿", "轮系图"],
    events: ["维修员将表针锁在十一点", "走时轮系停止传递", "独立报时轮继续蓄能", "午夜凸轮转到十二点槽位", "释放杆解除落锤锁扣", "落锤完成十二次循环", "钟面表针保持不动", "麦克风记录十二次等间隔撞击", "维修员复核两套轮系互不联动", "旧庆典录音带留在柜中但未播放"],
    evidence: [["表针锁销", "锁销只卡住指针轴，没有接触报时轮。"], ["走时轮停机单", "维修单明确关闭的是表针走时支路。"], ["报时配重", "独立配重仍处于上弦状态。"], ["午夜凸轮", "凸轮十二点槽位存在新鲜接触痕迹。"], ["释放杆油迹", "释放杆在午夜附近刚发生过运动。"], ["落锤计数器", "机械计数器累计增加十二次。"], ["表盘连续录像", "敲钟期间表针始终停在十一点。"], ["钟声波形", "十二次撞击间隔符合落锤轮，而非扬声器播放。"], ["双轮系剖面图", "图纸证明走时与报时只有共同机架，没有传动连接。"], ["庆典录音带", "录音带未装入播放器，是无关的旧物。"]],
    keywords: ["表针锁销", "走时轮", "报时配重", "午夜凸轮", "释放杆", "落锤计数", "表盘录像", "钟声波形", "双轮系", "庆典录音"], alternatives: ["钟楼实际时间并非午夜", "十二声来自隐藏扬声器播放"], motive: "在表盘维修期间保留法定报时功能", motif: "M50 8v18M50 74v18M8 50h18M74 50h18M50 50l-18-12M50 50l12-22"
  },
  {
    code: "c18", slug: "lighter-sealed-crate", title: "少了一公斤的密封箱",
    surface: "密封箱没有开封、没有移位，内容物清单也完整；同一台秤却显示它在十分钟内轻了一公斤。",
    truth: "秤在一公斤校准块留在台面时执行自动归零；之后移走校准块，箱子读数因此减少一公斤。",
    difficulty: "advanced", minutes: { min: 10, max: 20 }, mode: "measurement-model", layout: "metrology-bay", palette: "scale-green", accent: "#9bc18b",
    tags: ["测量基准", "自动归零", "守恒"], nav: ["计量台", "校准日志", "基准模型"],
    events: ["密封箱放上计量台", "一公斤校准块仍留在秤面", "操作员启动自动归零", "秤将当时总载荷设为零点", "箱子保持原位", "校准块被移回工具柜", "显示读数下降一公斤", "封条完整性复核通过", "独立吊秤确认箱体真实质量未变", "备用电池电量下降但不影响称量"],
    evidence: [["初始摆放照片", "照片显示密封箱旁紧贴一枚一公斤校准块。"], ["校准块证书", "校准块实测质量为1000.2克。"], ["自动归零日志", "归零发生在校准块仍位于台面时。"], ["零点寄存器", "寄存器保存了包含校准块的基准载荷。"], ["箱轮定位线", "箱子在两次读数间没有移动。"], ["工具柜记录", "校准块在第二次读数前被归还。"], ["显示变化曲线", "读数在校准块离台瞬间下降约一公斤。"], ["封条检查", "四枚封条均无破坏或重新粘贴痕迹。"], ["独立吊秤", "吊秤读数与封存前真实箱重一致。"], ["备用电池", "电池电量下降只影响续航，不改变传感器标定。"]],
    keywords: ["摆放照片", "校准块", "自动归零", "零点寄存", "定位线", "工具柜", "变化曲线", "封条", "独立吊秤", "备用电池"], alternatives: ["有人从密封箱中取走了一公斤物品", "计量台传感器发生随机故障"], motive: "完成夜班计量台的自动归零校准", motif: "M12 76h76M24 76l8-38h36l8 38M38 50h24M50 38v24"
  },
  {
    code: "c19", slug: "fog-after-window", title: "关窗后才出现的雾",
    surface: "窗户敞开时房间清澈，关闭并密封后反而出现白雾；没有漏水，也没有人启动加湿器。",
    truth: "关窗同时停止通风，室内湿气累积并越过冷玻璃的露点；白雾是延迟凝结，不是新增水源。",
    difficulty: "advanced", minutes: { min: 10, max: 20 }, mode: "state-trace", layout: "dewpoint-room", palette: "mist-cyan", accent: "#9ccbd0",
    tags: ["阈值", "环境滞后", "相变"], nav: ["雾室", "环境曲线", "阈值链"],
    events: ["白天清洗作业增加室内湿气", "开窗通风维持低湿度", "夜班关闭并密封窗户", "自然通风随之停止", "冷却盘管继续降低玻璃温度", "室内相对湿度持续上升", "玻璃表面温度跌破露点", "微小水滴形成可见白雾", "屋顶与加湿器检查均为阴性", "香氛瓶被发现但不产生水汽"],
    evidence: [["清洗作业单", "傍晚清洗为室内留下了可测湿负荷。"], ["开窗湿度段", "窗户开启时相对湿度稳定在露点以下。"], ["窗磁记录", "22:04窗户关闭后没有再次开启。"], ["通风流速计", "关窗后换气量迅速降到接近零。"], ["玻璃温度探头", "冷却盘管使玻璃持续降温。"], ["湿度上升曲线", "密封后湿度缓慢上升而非突然增加。"], ["露点计算表", "22:17玻璃温度首次低于当时露点。"], ["雾滴显微图", "水滴只附着在冷表面，没有喷射方向。"], ["水源排除单", "屋顶、管线和加湿器均未发现供水。"], ["香氛瓶", "瓶盖完好，挥发量不足以形成白雾。"]],
    keywords: ["清洗湿气", "开窗湿度", "窗磁", "通风流速", "玻璃温度", "湿度曲线", "露点", "雾滴", "水源排除", "香氛瓶"], alternatives: ["有人偷偷启动隐藏加湿器", "屋顶漏水在关窗后突然加重"], motive: "完成低温密封环境的露点测试", motif: "M8 70c14-24 24-8 36-28s24-4 48-32M12 82h76M24 28h52"
  },
  {
    code: "c20", slug: "fifth-worker", title: "六个岗位的第五个人",
    surface: "六个岗位都完成了本人签到，所有凭证也合法；监控从头到尾却只出现五个人。",
    truth: "签到系统记录岗位资格而非唯一自然人；一名持双资质的值班员在两个时段合法兼任两个岗位。",
    difficulty: "advanced", minutes: { min: 10, max: 20 }, mode: "identity-matrix", layout: "roster-grid", palette: "ledger-violet", accent: "#b79ad2",
    tags: ["集合基数", "角色身份", "权限语义"], nav: ["值班区", "资质记录", "身份矩阵"],
    events: ["五名值班员依次进入", "六个岗位等待资格签到", "林闻为安全员岗位签到", "第一轮安全检查结束", "林闻切换到调度员终端", "双资质令牌通过验证", "调度员岗位完成签到", "其余四人各完成一个岗位", "摄像复核确认始终只有五人", "空置的第六把椅子被拍下但不代表缺岗"],
    evidence: [["唯一门禁名单", "只有五个自然人身份进入值班区。"], ["岗位签到表", "表格有六行，但主键是岗位编号。"], ["安全员记录", "林闻先以安全员资质完成第一轮任务。"], ["第一轮结束时间", "安全员任务在调度签到前已经结束。"], ["终端切换日志", "同一枚人员令牌随后登录调度终端。"], ["双资质证书", "林闻同时持有安全与调度两项有效资质。"], ["调度签到记录", "记录证明岗位被覆盖，不声称出现第六个人。"], ["其余岗位表", "另外四人分别覆盖四个互斥岗位。"], ["全程摄像计数", "任何时刻画面最多只有五名不同人物。"], ["空椅照片", "椅子按岗位配置，空置不等于岗位无人负责。"]],
    keywords: ["门禁名单", "岗位主键", "安全员记录", "任务结束", "终端切换", "双资质", "调度签到", "其余岗位", "摄像计数", "空椅"], alternatives: ["存在一名未登记的第六名值班员", "有人伪造了其中一个岗位签到"], motive: "在夜班缺员时按双资质规则兼任岗位", motif: "M10 18h30v26H10zM58 18h30v26H58zM10 56h30v26H10zM58 56h30v26H58z"
  },
  {
    code: "c21", slug: "missing-seven-minutes", title: "完整录像里消失的七分钟",
    surface: "录像索引从00:00连续到00:20，没有删除、断网或坏帧；关键的七分钟却没有任何连续画面。",
    truth: "相机进入低功耗抽样模式，每分钟只保留一帧；连续索引描述文件覆盖区间，不代表连续采样。",
    difficulty: "expert", minutes: { min: 12, max: 20 }, mode: "sampling-window", layout: "frame-audit", palette: "monitor-blue", accent: "#79a9d6",
    tags: ["采样窗口", "负证据", "元数据语义"], nav: ["监控室", "帧审计", "采样窗"],
    events: ["相机以每秒二十五帧正常录像", "备用电源电量跌至阈值", "控制器切换到低功耗模式", "文件索引继续记录覆盖区间", "相机每分钟只采集一帧", "缓慢移动发生在两次采样之间", "七分钟内仅留下七张静态帧", "电源恢复后帧率回到正常", "哈希审计证明文件没有删改", "网络日志证明链路始终在线", "播放器用连续时间轴掩盖采样间隔", "一段无关的屏保录像被单独归档"],
    evidence: [["正常帧率段", "00:00至00:04保持每秒二十五帧。"], ["电池阈值日志", "00:05备用电源跌破节能阈值。"], ["模式切换记录", "控制器自动切换为每分钟一帧。"], ["文件索引说明", "索引的起止时间只表示文件覆盖范围。"], ["帧间隔表", "关键区间相邻帧时间差均接近六十秒。"], ["慢移轨迹", "对象位置在七张帧之间逐步变化。"], ["七张原始帧", "关键七分钟确实只有七张合法采样。"], ["供电恢复记录", "00:12后帧率立即恢复。"], ["文件哈希链", "每个片段哈希连续，没有删除或重编码。"], ["网络心跳", "网络始终在线，因此断网不能解释缺帧。"], ["播放器时间轴", "播放器把低频帧拉伸到连续二十分钟刻度。"], ["屏保片段", "屏保来自另一终端，与相机采样无关。"]],
    keywords: ["正常帧率", "电池阈值", "模式切换", "索引说明", "帧间隔", "慢移轨迹", "七张原始帧", "供电恢复", "哈希链", "网络心跳", "播放器时间轴", "屏保片段"], alternatives: ["有人删除了关键七分钟后重做索引", "监控网络在关键时段完全中断"], motive: "在备用电源不足时延长监控续航", motif: "M8 18h84v64H8zM18 30h14v14H18zM42 30h14v14H42zM66 30h14v14H66zM18 56h62"
  },
  {
    code: "c22", slug: "overloaded-bridge", title: "没有超标的超载桥",
    surface: "每个车轴读数都低于法定上限，也没有额外车辆；桥梁系统却正确触发了超载封闭。",
    truth: "单轴阈值与桥跨总载荷是两种约束；多根合规车轴同时位于主跨时，总和超过了结构限值。",
    difficulty: "expert", minutes: { min: 12, max: 20 }, mode: "aggregate-constraint", layout: "bridge-load", palette: "structural-orange", accent: "#d8905f",
    tags: ["聚合约束", "测量语义", "并发状态"], nav: ["桥跨", "轴重记录", "载荷板"],
    events: ["重型车辆前轴进入主跨", "第一轴读数低于单轴上限", "第二轴进入主跨", "第二轴读数仍然合规", "后组双轴同时进入主跨", "控制器累加当前桥跨全部轴重", "总载荷越过结构阈值", "桥梁触发红灯和道闸", "车辆停止后总载荷不再增加", "独立应变计确认结构受力", "审计证明没有隐藏车辆", "路边广告牌振动被记录但与载荷无关"],
    evidence: [["前轴读数", "前轴质量低于单轴法定上限。"], ["单轴法规表", "法规表只限制每根车轴的最大值。"], ["第二轴记录", "第二轴也没有单独超标。"], ["双轴时间戳", "后组双轴在前轴离桥前进入主跨。"], ["桥跨占用图", "报警瞬间四根轴同时位于受限跨段。"], ["聚合公式", "控制器计算当前桥跨所有轴重之和。"], ["总载荷曲线", "四轴总和在00:18越过结构阈值。"], ["红灯日志", "红灯由总载荷通道触发，而非单轴通道。"], ["停车定位", "车辆在道闸前停止，没有第二辆车。"], ["应变计曲线", "独立结构传感器出现同一时刻峰值。"], ["全景审计", "画面排除了隐藏车辆或并排行驶。"], ["广告牌振动", "广告牌振动发生在路侧，不进入载荷计算。"]],
    keywords: ["前轴读数", "单轴法规", "第二轴", "双轴时间", "桥跨占用", "聚合公式", "总载荷", "红灯日志", "停车定位", "应变计", "全景审计", "广告牌"], alternatives: ["某个车轴传感器偷偷报出了超标值", "桥上同时存在一辆未被记录的车辆"], motive: "保护主跨不承受超过结构设计值的同时载荷", motif: "M6 70h88M14 70l12-34h48l12 34M32 36v34M68 36v34"
  },
  {
    code: "c23", slug: "clean-air-sample", title: "泄漏时仍然清洁的空气样本",
    surface: "泄漏警报已经触发，取样仪却连续显示空气清洁；仪器没有坏，样本也没有被替换。",
    truth: "取样口位于泄漏点上游，且长采样管存在输送延迟；屏幕显示的是更早、不同位置吸入的空气。",
    difficulty: "expert", minutes: { min: 12, max: 20 }, mode: "provenance-chain", layout: "air-route", palette: "hazard-teal", accent: "#65b8a8",
    tags: ["来源路线", "检测边界", "输送延迟"], nav: ["管廊", "采样记录", "来源链"],
    events: ["上游取样口持续吸入清洁空气", "空气进入四十米采样管", "泄漏点在下游阀门附近形成", "现场警报器直接检测到泄漏", "采样管中的旧空气继续向仪器移动", "仪器分析早先吸入的上游样本", "屏幕仍显示清洁", "输送延迟窗口结束", "下游污染才到达分析室", "仪器随后正确显示升高", "校准气体证明传感器正常", "一只废弃口罩被发现但未遮挡取样口"],
    evidence: [["取样口地图", "固定取样口位于泄漏阀门的上游侧。"], ["采样管长度", "从取样口到分析仪共有四十米管路。"], ["阀门泄漏记录", "泄漏首先出现在下游支路。"], ["现场警报探头", "警报探头就在泄漏点附近，没有长管延迟。"], ["管内流速", "当前流速下样本需要约九分钟到达分析仪。"], ["吸入时间字段", "记录保存了取样时间，不等于屏幕刷新时间。"], ["清洁读数窗口", "清洁读数对应泄漏前已进入管路的空气。"], ["延迟结束点", "九分钟后第一段污染样本抵达。"], ["浓度上升曲线", "仪器随后按计算时刻显示浓度升高。"], ["校准气体测试", "传感器对标准气体响应完全正常。"], ["风向记录", "气流从上游取样口指向下游泄漏区。"], ["废弃口罩", "口罩位于地面，没有覆盖或过滤取样口。"]],
    keywords: ["取样口地图", "采样管长度", "泄漏阀门", "现场探头", "管内流速", "吸入时间", "清洁窗口", "延迟结束", "浓度曲线", "校准气体", "风向", "废弃口罩"], alternatives: ["有人伪造了清洁样本替换污染空气", "泄漏其实发生在清洁读数结束之后"], motive: "使用集中分析仪连续监测多条远端管线", motif: "M10 24h22v18h36v34h22M18 24v52M32 33h20M68 58h14"
  },
  {
    code: "c24", slug: "turned-painting", title: "闭馆后转向的画",
    surface: "展厅门整夜未开，画框封条完好，连续全景监控也没有拍到搬运；清晨画却朝向了相反方向。",
    truth: "画框固定在可从服务侧驱动的旋转墙上；异步全景又把转动前后的扇区拼成一幅看似连续的画面。",
    difficulty: "expert", minutes: { min: 15, max: 25 }, mode: "spatial-map", layout: "rotating-gallery", palette: "museum-crimson", accent: "#c87974",
    tags: ["多板综合", "移动边界", "合成观察"], nav: ["展厅", "安防档案", "综合证明"],
    events: ["画框封条在闭馆前完成检查", "展厅人员门进入夜间锁定", "服务廊维护凭证获得授权", "旋转墙从服务侧解除制动", "相机开始逐扇区扫描全景", "墙体在两个扇区采样之间旋转", "画框随墙保持固定并改变朝向", "旋转墙在反向位置重新制动", "全景软件拼接转动前后画面", "展厅门日志继续保持关闭", "清晨检查发现画面朝向改变", "复制画框清单证明没有第二幅画"],
    evidence: [["画框封条", "封条跨过画框与墙面安装座，整夜连续完好。"], ["展厅门日志", "人员通行门没有开启。"], ["服务廊授权", "00:22维护凭证只进入墙体背后的服务廊。"], ["旋转墙图纸", "整面展墙安装在可一百八十度旋转的轴承上。"], ["制动释放记录", "服务侧控制器在00:24解除墙体制动。"], ["全景扇区时间码", "看似连续的全景各扇区实际相差四秒。"], ["墙轴角度曲线", "墙体在东、西扇区采样之间完成转向。"], ["重新制动日志", "00:25墙体锁定在反向位置。"], ["拼接工程文件", "软件把转动前的东侧与转动后的西侧放进同一全景。"], ["门磁连续审计", "展厅门关闭与墙体旋转可以同时为真。"], ["清晨定位照片", "画框相对墙体没有移动，相对展厅方向发生改变。"], ["藏品唯一清单", "馆内只有这一幅登记画作，不存在替换副本。"]],
    keywords: ["画框封条", "展厅门", "服务廊授权", "旋转墙图纸", "制动释放", "扇区时间码", "墙轴角度", "重新制动", "拼接文件", "门磁审计", "定位照片", "唯一清单"], alternatives: ["入侵者伪造门禁后翻转了画框", "有人用一幅反向复制画替换原作"], motive: "在不开放展厅的情况下检查旋转墙背部结构", motif: "M12 16h76v68H12zM26 28h48v44H26zM50 20v60M42 50h16"
  },
];

const root = resolve(process.argv[2] ?? ".");
const caseDir = resolve(root, "content/zh/cases");
const publicDir = resolve(root, "apps/web/public");
const reviewDir = resolve(root, "docs");
const reportDir = resolve(root, "docs/content-reports");

function write(path: string, value: string | object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function caseId(seed: Seed) { return `${seed.code}-${seed.slug}`; }

const wrappers = [
  "请核对", "我想验证", "现场能否证明", "记录里是否支持", "请只回答事实", "从时间关系看", "从空间关系看", "换个说法确认", "这个细节是否成立", "能排除相反情况吗",
  "请检查一下", "证据是否说明", "调查中能确认", "在关键时段", "在异常发生前后", "就物理条件而言", "就来源而言", "不要猜答案只验证", "请给出确定判断", "这项记录能否证实",
];

function makeCorpus(seed: Seed, id: string): QueryCorpusEntry[] {
  const entries: QueryCorpusEntry[] = [];
  seed.keywords.forEach((keyword, queryIndex) => {
    wrappers.forEach((wrapper, index) => entries.push({
      id: `${seed.code}-q${String(queryIndex + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
      rawQuestion: `${wrapper}：${keyword}这条信息是否成立（角度${index + 1}）？`,
      expectedQueryId: `query-${seed.code}-${String(queryIndex + 1).padStart(2, "0")}`,
      expectedStatus: "matched",
      category: "positive",
    }));
  });
  for (let index = 0; index < 8; index += 1) entries.push({
    id: `${seed.code}-amb-${index + 1}`,
    rawQuestion: `关键记录是否相关，按第${index + 1}种理解？`,
    expectedStatus: "ambiguous",
    category: "ambiguous",
  });
  const closed = ["请直接告诉我汤底", "凶手是谁", "是不是超自然现象", "答案到底是什么", "我猜就是魔法", "这游戏怎么通关", "能不能跳过调查", "请把隐藏事实列出来", "系统证书是什么", "内部事件编号是多少", "随便回答一个结论", "这个故事是真的吗"];
  closed.forEach((rawQuestion, index) => entries.push({ id: `${seed.code}-closed-${index + 1}`, rawQuestion, expectedStatus: "unrecognized", category: index < 4 ? "spoiler-seeking" : "unrecognized" }));
  return entries;
}

function makeCase(seed: Seed): CaseFile {
  const id = caseId(seed);
  const n = seed.events.length;
  const requiredCount = n === 12 ? 10 : 8;
  const replayBeatCount = n === 12 ? 7 : 6;
  const events = seed.events.map((label, index) => ({
    id: `event-${seed.code}-${String(index + 1).padStart(2, "0")}`,
    order: (index + 1) * 10,
    time: { kind: "instant", value: `00:${String(index * 2).padStart(2, "0")}` },
    participants: [`entity-${seed.code}-mechanism`],
    locationId: `location-${seed.code}`,
    action: `step-${seed.code}-${index + 1}`,
    labelKey: `event.${seed.code}.${index + 1}`,
    effectFactIds: [`fact-${seed.code}-${String(index + 1).padStart(2, "0")}`],
    sourceType: index === n - 1 ? "red-herring" : "canonical-event",
    solutionRole: index === n - 1 ? "supporting" : "required",
  }));
  const factCount = n + 5;
  const facts = Array.from({ length: factCount }, (_, index) => {
    const eventIndex = index % n;
    const evidenceIndex = index < n ? index % seed.evidence.length : 3 + ((index - n) % Math.max(1, seed.evidence.length - 4));
    return {
      id: `fact-${seed.code}-${String(index + 1).padStart(2, "0")}`,
      predicate: `claim_${seed.code}_${index + 1}`,
      args: { caseId: id, step: index + 1 },
      truth: true,
      sourceEventIds: [events[eventIndex].id],
      visibilityRuleIds: [index < 3 ? `rule-${seed.code}-opening` : `rule-${seed.code}-${String(evidenceIndex + 1).padStart(2, "0")}`],
      evidenceItemIds: [`evidence-${seed.code}-${String(evidenceIndex + 1).padStart(2, "0")}`],
      importance: index < requiredCount ? "required" : index === factCount - 1 ? "background" : "supporting",
      localizationKey: `fact.${seed.code}.${index + 1}`,
    };
  });
  const evidenceItems = seed.evidence.map(([title, observation], index) => ({
    id: `evidence-${seed.code}-${String(index + 1).padStart(2, "0")}`,
    kind: index % 3 === 0 ? "scene" : index % 3 === 1 ? "record" : "object",
    titleKey: `evidence.${seed.code}.${index + 1}.title`,
    observationKey: `evidence.${seed.code}.${index + 1}.observation`,
    sourceFactIds: facts.filter((fact) => fact.evidenceItemIds[0] === `evidence-${seed.code}-${String(index + 1).padStart(2, "0")}`).map((fact) => fact.id),
    sourceEventIds: [events[index % n].id],
    relatedEntityIds: [`entity-${seed.code}-mechanism`, `location-${seed.code}`],
    defaultState: index === 0 ? "discovered" : "available",
    supports: index === seed.evidence.length - 1 ? [] : ["hypothesis-canonical"],
    conflicts: index < 2 ? [`hypothesis-${seed.code}-alternative-${index + 1}`] : [],
    sourceLabelKey: index % 3 === 0 ? "evidence.source.scene" : index % 3 === 1 ? "evidence.source.record" : "evidence.source.object",
    importance: index === seed.evidence.length - 1 ? "irrelevant" : "required",
  }));
  const visibilityRules = [
    { id: `rule-${seed.code}-opening`, mode: "scene", requires: { discoveredEvidenceIds: [], visitedLocationIds: [], answeredQueryIds: [] }, revealsFactIds: facts.slice(0, 3).map((fact) => fact.id), spoilerLevel: "safe" },
    ...evidenceItems.map((evidence, index) => ({ id: `rule-${seed.code}-${String(index + 1).padStart(2, "0")}`, mode: "evidence", requires: { discoveredEvidenceIds: [evidence.id], visitedLocationIds: [], answeredQueryIds: [] }, revealsFactIds: evidence.sourceFactIds.filter((factId) => !facts.slice(0, 3).some((fact) => fact.id === factId)), spoilerLevel: index < 3 ? "safe" : index < requiredCount ? "sensitive" : "final" })),
  ];
  const questionSemantics = seed.keywords.map((keyword, index) => ({
    id: `query-${seed.code}-${String(index + 1).padStart(2, "0")}`,
    labelKey: `query.${seed.code}.${index + 1}`,
    intent: index < requiredCount ? "verify" : "eliminate",
    predicate: facts[index].predicate,
    slots: { subjectId: `entity-${seed.code}-mechanism` },
    answerCodeWhenVisible: index === seed.keywords.length - 1 ? "irrelevant" as const : "yes" as const,
    supportingFactIds: [facts[index].id],
    visibilityRuleIds: [index < 3 ? `rule-${seed.code}-opening` : `rule-${seed.code}-${String(index + 1).padStart(2, "0")}`],
    examplePhrases: [`${keyword}这条信息是否成立？`, `能确认${keyword}吗？`],
    matchRules: [
      { all: [keyword], priority: 9 },
      ...(index < 2 ? [{ any: ["关键记录"], priority: 2 }] : []),
    ],
  }));
  const allEvidenceIds = evidenceItems.map((item) => item.id);
  const requiredEvidenceIds = allEvidenceIds.slice(0, -1);
  const setA = requiredEvidenceIds.slice(0, requiredCount);
  const setB = [...requiredEvidenceIds.slice(0, requiredCount - 2), ...requiredEvidenceIds.slice(-2)];
  const canonicalEvents = events.slice(0, n - 1).map((event) => event.id);
  const boardEvents = [canonicalEvents[1], canonicalEvents[Math.floor((n - 1) / 3)], canonicalEvents[Math.floor(((n - 1) * 2) / 3)], canonicalEvents.at(-1)!];
  const localization: Record<string, string> = {
    [`case.${seed.code}.title`]: seed.title,
    [`case.${seed.code}.surface`]: seed.surface,
    [`case.${seed.code}.truth`]: seed.truth,
    [`entity.${seed.code}.mechanism`]: "关键装置与记录",
    [`location.${seed.code}`]: seed.nav[0],
    [`board.${seed.code}.title`]: seed.nav[2],
    [`chapter.${seed.code}.one`]: "异常固定",
    [`chapter.${seed.code}.two`]: "来源与约束",
    [`hypothesis.${seed.code}.canonical`]: seed.truth,
    [`hypothesis.${seed.code}.alternative.1`]: seed.alternatives[0],
    [`hypothesis.${seed.code}.alternative.2`]: seed.alternatives[1],
    [`motive.${seed.motive}`]: seed.motive,
    "evidence.source.scene": "现场来源",
    "evidence.source.record": "记录来源",
    "evidence.source.object": "物证来源",
  };
  seed.events.forEach((label, index) => { localization[`event.${seed.code}.${index + 1}`] = label; });
  seed.evidence.forEach(([title, observation], index) => { localization[`evidence.${seed.code}.${index + 1}.title`] = title; localization[`evidence.${seed.code}.${index + 1}.observation`] = observation; });
  seed.keywords.forEach((keyword, index) => { localization[`query.${seed.code}.${index + 1}`] = `${keyword}这条信息是否成立？`; });
  boardEvents.forEach((_, index) => { localization[`board.${seed.code}.slot.${index + 1}`] = ["起始条件", "关键变化", "可见结果", "排除替代"][index]; });
  const chapters = n === 12 ? [
    { id: `chapter-${seed.code}-one`, titleKey: `chapter.${seed.code}.one`, unlock: {} },
    { id: `chapter-${seed.code}-two`, titleKey: `chapter.${seed.code}.two`, unlock: { discoveredEvidenceIds: allEvidenceIds.slice(0, 4) } },
  ] : [{ id: `chapter-${seed.code}-one`, titleKey: `chapter.${seed.code}.one`, unlock: {} }];
  return {
    schemaVersion: "1.0",
    id,
    metadata: { titleKey: `case.${seed.code}.title`, difficulty: seed.difficulty, ageRating: "16+", contentTags: seed.tags, targetMinutes: seed.minutes, contentVersion: 1, canonicalHash: `sha256:${id}-v1`, status: "internal-rc", seasonId: "season-2" },
    presentation: { layoutId: seed.layout, sceneAsset: `/scene-${seed.slug}.svg`, palette: seed.palette, accent: seed.accent, questionPromptMode: "forensic-host", evidenceVisualMode: `${seed.mode}-dossier`, mobileNavigation: seed.nav, boardMode: seed.mode },
    surface: { titleKey: `case.${seed.code}.title`, textKey: `case.${seed.code}.surface`, publicFactIds: facts.slice(0, 3).map((fact) => fact.id), initialQuestionPrompts: questionSemantics.slice(0, 3).map((query) => query.id) },
    chapters,
    reasoningBoards: [{ id: `board-${seed.code}-main`, titleKey: `board.${seed.code}.title`, mode: seed.mode, slots: boardEvents.map((eventId, index) => ({ id: `slot-${seed.code}-${index + 1}`, labelKey: `board.${seed.code}.slot.${index + 1}`, acceptsEventIds: [eventId] })), allowedRelations: ["causes", "precedes", "explains"] }],
    replayChallenges: [{ mode: "limited-questions", questionLimit: n === 12 ? 14 : 12 }, { mode: "minimal-proof" }, { mode: "no-scaffolds" }],
    entities: [
      { id: `entity-${seed.code}-mechanism`, kind: "object", labelKey: `entity.${seed.code}.mechanism`, publicAtStart: true },
      { id: `location-${seed.code}`, kind: "location", labelKey: `location.${seed.code}`, publicAtStart: true },
    ],
    events,
    relations: boardEvents.slice(0, 3).map((eventId, index) => ({ id: `relation-${seed.code}-${index + 1}`, type: index === 0 ? "precedes" : "causes", fromId: `entity-${seed.code}-mechanism`, toId: `location-${seed.code}`, eventId, factId: facts[index + 1].id })),
    facts,
    visibilityRules,
    questionSemantics,
    answerPolicy: { codes: ["yes", "no", "partial", "invalid_premise", "unknown", "irrelevant", "unanswerable", "unrecognized"], templates: { yes: "是。当前来源支持这个判断。", no: "不是。这个判断与已验证约束冲突。", partial: "部分相关，但因果链还没有闭合。", invalid_premise: "这个问题的前提不成立。", unknown: "目前还没有足够证据判断。", irrelevant: "这条信息真实，但不会改变核心因果链。", unanswerable: "案件没有定义这个属性。", unrecognized: "我还不能把这个问题对应到一个明确的调查事实。" } },
    evidenceItems,
    hypotheses: [
      { id: "hypothesis-canonical", kind: "canonical", labelKey: `hypothesis.${seed.code}.canonical`, claim: { eventIds: canonicalEvents, motiveKey: seed.motive }, requiredEvidenceIds, requiredContradictionResolutionIds: [`contradiction-${seed.code}-1`, `contradiction-${seed.code}-2`], status: "candidate" },
      { id: `hypothesis-${seed.code}-alternative-1`, kind: "alternative", labelKey: `hypothesis.${seed.code}.alternative.1`, claim: { assertedPropositions: [seed.alternatives[0]], motiveKey: `motive-${seed.code}-alternative-1` }, requiredEvidenceIds: [allEvidenceIds[0]], requiredContradictionResolutionIds: [`contradiction-${seed.code}-1`], status: "candidate" },
      { id: `hypothesis-${seed.code}-alternative-2`, kind: "alternative", labelKey: `hypothesis.${seed.code}.alternative.2`, claim: { assertedPropositions: [seed.alternatives[1]], motiveKey: `motive-${seed.code}-alternative-2` }, requiredEvidenceIds: [allEvidenceIds[1]], requiredContradictionResolutionIds: [`contradiction-${seed.code}-2`], status: "candidate" },
    ],
    contradictions: [
      { id: `contradiction-${seed.code}-1`, kind: "alternative-exclusion", requiresFactIds: [facts[0].id], invalidatesHypothesisIds: [`hypothesis-${seed.code}-alternative-1`], resolutionEvidenceIds: [allEvidenceIds[0]], severity: "hard" },
      { id: `contradiction-${seed.code}-2`, kind: "alternative-exclusion", requiresFactIds: [facts[1].id], invalidatesHypothesisIds: [`hypothesis-${seed.code}-alternative-2`], resolutionEvidenceIds: [allEvidenceIds[1]], severity: "hard" },
    ],
    solutionCertificate: {
      canonicalHypothesisId: "hypothesis-canonical",
      requiredFactIds: facts.slice(0, requiredCount).map((fact) => fact.id),
      requiredEvidenceIds,
      requiredEventOrder: canonicalEvents.slice(0, -1).map((eventId, index) => [eventId, canonicalEvents[index + 1]]),
      requiredContradictionResolutionIds: [`contradiction-${seed.code}-1`, `contradiction-${seed.code}-2`],
      alternativeHypothesisIds: [`hypothesis-${seed.code}-alternative-1`, `hypothesis-${seed.code}-alternative-2`],
      minimumProofSetId: `proof-${seed.code}-a`,
      minimumProofSets: [{ id: `proof-${seed.code}-a`, evidenceIds: setA }, { id: `proof-${seed.code}-b`, evidenceIds: setB }],
      acceptedMotiveKeys: [seed.motive],
      proofObligations: [{ id: `obligation-${seed.code}-main`, kind: seed.mode === "spatial-map" ? "space" : seed.mode === "identity-matrix" ? "identity" : seed.mode === "measurement-model" || seed.mode === "aggregate-constraint" ? "measurement" : seed.mode === "provenance-chain" ? "source" : "state-transition", boardId: `board-${seed.code}-main`, requiredPlacements: boardEvents.map((eventId, index) => ({ slotId: `slot-${seed.code}-${index + 1}`, eventId })), requiredConnections: boardEvents.slice(0, -1).map((eventId, index) => ({ fromEventId: eventId, toEventId: boardEvents[index + 1], relation: "causes" })), failureCategory: seed.mode === "spatial-map" ? "space" : seed.mode === "identity-matrix" ? "identity" : seed.mode === "measurement-model" || seed.mode === "aggregate-constraint" ? "measurement" : seed.mode === "provenance-chain" ? "source" : "state-transition" }],
      uniquenessClaim: seed.truth,
    },
    proofReplay: Array.from({ length: replayBeatCount }, (_, index) => ({ id: `replay-${seed.code}-${index + 1}`, eventId: canonicalEvents[Math.min(index + 1, canonicalEvents.length - 1)], factIds: index === replayBeatCount - 1 ? facts.slice(index, requiredCount).map((fact) => fact.id) : [facts[index].id], captionKey: `event.${seed.code}.${Math.min(index + 2, seed.events.length)}` })),
    localization: { "zh-CN": localization },
  } as CaseFile;
}

function corpusSource(seed: Seed, corpus: QueryCorpusEntry[]) {
  const name = `${seed.code}QuestionCorpus`;
  return `import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/index.ts";\n\nexport const ${name}: QueryCorpusEntry[] = ${JSON.stringify(corpus, null, 2)};\n`;
}

function sceneSvg(seed: Seed) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 620" role="img" aria-labelledby="title desc"><title id="title">${seed.title}</title><desc id="desc">${seed.nav[0]}的档案式场景插画</desc><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#080b0e"/><stop offset="1" stop-color="${seed.accent}" stop-opacity=".22"/></linearGradient><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0v32" fill="none" stroke="${seed.accent}" stroke-opacity=".1"/></pattern></defs><rect width="960" height="620" fill="url(#bg)"/><rect width="960" height="620" fill="url(#grid)"/><path d="M90 470H870" stroke="${seed.accent}" stroke-opacity=".5" stroke-width="2"/><g transform="translate(300 120) scale(3.6)" fill="none" stroke="${seed.accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${seed.motif}"/></g><text x="84" y="92" fill="#eee8da" font-family="serif" font-size="30">${seed.title}</text><text x="84" y="128" fill="${seed.accent}" font-family="monospace" font-size="16">THE BLACK SOUP / ${seed.code.toUpperCase()} / ${seed.mode.toUpperCase()}</text><text x="84" y="576" fill="${seed.accent}" font-family="monospace" font-size="14">INTERNAL RC · DETERMINISTIC EVIDENCE</text></svg>`;
}

const manifestCases = [];
for (const seed of seeds) {
  const id = caseId(seed);
  const caseFile = makeCase(seed);
  const corpus = makeCorpus(seed, id);
  const casePath = resolve(caseDir, `${id}.json`);
  write(casePath, caseFile);
  write(resolve(caseDir, `${seed.code}-question-corpus.ts`), corpusSource(seed, corpus));
  write(resolve(caseDir, `${id}.test-vectors.json`), {
    caseId: id,
    normalizationVectors: corpus.slice(0, 24),
    ambiguityVectors: corpus.filter((item) => item.expectedStatus === "ambiguous"),
    failClosedVectors: corpus.filter((item) => item.expectedStatus === "unrecognized"),
    canonical: { evidenceIds: caseFile.solutionCertificate.minimumProofSets[0].evidenceIds, eventCount: caseFile.hypotheses[0].claim?.eventIds?.length, boardMode: seed.mode },
  });
  write(resolve(publicDir, `scene-${seed.slug}.svg`), sceneSvg(seed));
  write(resolve(reviewDir, `${id}-content-review.md`), `# ${seed.title} 内容审查\n\n- 状态：internal-rc / human evaluation pending\n- 核心真相：${seed.truth}\n- 主推理技能：${seed.tags.join(" / ")}\n- 作者错误理论：${seed.alternatives.join("；")}\n- 语料：${corpus.length} 条，其中预期歧义 8 条、fail-closed 12 条。\n- 真人参与：0。本文档不声明案件已被证明好玩。\n`);
  write(resolve(reportDir, `${id}.md`), `# ${id} 自动内容报告\n\n生成状态：等待 validate:cases 与 v1.0 fairness sweep。\n\n- 事件：${caseFile.events.length}\n- 事实：${caseFile.facts.length}\n- 证据：${caseFile.evidenceItems.length}\n- 查询：${caseFile.questionSemantics.length}\n- 语料：${corpus.length}\n- 推理板：${seed.mode}\n`);
  const raw = readFileSync(casePath);
  manifestCases.push({ id, file: `${id}.json`, contentVersion: 1, canonicalHash: caseFile.metadata?.canonicalHash, status: "internal-rc", publishable: false, fileSha256: createHash("sha256").update(raw).digest("hex"), public: { title: seed.title, surface: seed.surface, difficulty: seed.difficulty, targetMinutes: seed.minutes, contentTags: seed.tags, layoutId: seed.layout, sceneAsset: `/scene-${seed.slug}.svg`, accent: seed.accent, boardMode: seed.mode, replayChallenges: caseFile.replayChallenges } });
}

write(resolve(caseDir, "manifest.season2.v1.0.json"), {
  manifestVersion: "1.0",
  seasonId: "season-2",
  title: "第二季：观测的边界",
  status: "internal-rc",
  publishable: false,
  humanEvaluation: { status: "pending", participants: 0, requiredBeforePublish: true },
  cases: manifestCases,
});
write(resolve(root, "content/zh/releases/season1-v0.9-stable.json"), { profileVersion: 1, id: "season1-v0.9-stable", title: "Season 1 v0.9 Stable", status: "frozen-for-human-evaluation", manifests: ["../cases/manifest.v0.6.json"] });
write(resolve(root, "content/zh/releases/v1.0-internal-rc.json"), { profileVersion: 1, id: "v1.0-internal-rc", title: "TURTLE SOUP v1.0 Internal RC", status: "internal-rc", publishable: false, humanEvaluation: "pending", manifests: ["../cases/manifest.v0.6.json", "../cases/manifest.season2.v1.0.json"] });
console.log(JSON.stringify({ generatedCases: seeds.length, corpusEntries: seeds.reduce((sum, seed) => sum + makeCorpus(seed, caseId(seed)).length, 0), manifest: "content/zh/cases/manifest.season2.v1.0.json" }, null, 2));
