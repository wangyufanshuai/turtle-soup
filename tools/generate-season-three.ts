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
  difficulty: "advanced" | "expert";
  minutes: { min: number; max: number };
  modes: [ReasoningBoardMode, ReasoningBoardMode] | [ReasoningBoardMode, ReasoningBoardMode, ReasoningBoardMode];
  accent: string;
  palette: string;
  tags: string[];
  nav: [string, string, string];
  events: string[];
  evidence: Array<[string, string]>;
  keywords: string[];
  alternatives: [string, string];
  purpose: string;
};

const seeds: Seed[] = [
  {
    code: "c25", slug: "silent-second-bell", title: "没有响起的第二次门铃",
    surface: "访客在十秒内按了两次门铃，控制器也记录了两次触发；屋内的人却只听见一次。",
    truth: "两次按压都真实发生，但控制器的十秒防抖窗口把第二次触发合并进第一次响铃周期，触发记录不等于声音次数。",
    difficulty: "advanced", minutes: { min: 8, max: 18 }, modes: ["state-trace", "measurement-model"], accent: "#d8a85f", palette: "doorbell-amber", tags: ["状态机", "防抖窗口", "记录语义"], nav: ["门廊", "控制器", "状态链"],
    events: ["访客第一次按下按钮", "控制器登记第一次电平变化", "室内铃开始一次完整响铃", "防抖窗口保持开启", "访客第二次按下按钮", "控制器登记第二次电平变化", "第二次触发被合并到当前周期", "防抖窗口关闭", "声学记录只留下一个响铃包络", "旧电池警告仍在日志中但没有造成静音"],
    evidence: [["按钮接点波形", "波形有两次彼此分离的接点闭合。"], ["触发计数器", "控制器累计计数增加了两次。"], ["响铃包络", "室内麦克风只记录到一个完整的声音包络。"], ["防抖参数", "固件把十秒内的重复触发归入同一响铃周期。"], ["两次按压间隔", "两次接点闭合只相隔六点八秒。"], ["状态迁移日志", "第二次触发发生时系统仍处于 RINGING 状态。"], ["扬声器自检", "扬声器在事后自检中正常发声。"], ["供电曲线", "门铃全程电压高于最低工作阈值。"], ["室内证词", "住户明确只听到一次连续响铃。"], ["旧电池警告", "警告来自一个月前，当前电池已经更换。"]],
    keywords: ["按钮波形", "触发计数", "响铃包络", "防抖参数", "按压间隔", "状态日志", "扬声器自检", "供电曲线", "住户证词", "旧电池警告"], alternatives: ["访客谎称按了第二次", "扬声器在第二次按压时临时故障"], purpose: "避免机械抖动造成连续重复响铃"
  },
  {
    code: "c26", slug: "short-map-pipeline", title: "比地图短的管线",
    surface: "施工图上的管线只有四十米，验收仪却测得六十三米；管线没有绕出图纸标出的走廊。",
    truth: "施工图是平面投影，管线在两座竖井内多次下降和上升；走廊投影没有变化，真实三维长度却包含垂直段。",
    difficulty: "advanced", minutes: { min: 9, max: 19 }, modes: ["spatial-map", "aggregate-constraint"], accent: "#76b7c4", palette: "blueprint-cyan", tags: ["空间投影", "三维长度", "分段求和"], nav: ["管廊", "测绘记录", "空间图"],
    events: ["测绘员标记走廊起点", "平面图记录水平投影", "管线进入第一座竖井", "管线下降到设备层", "管线沿设备层穿过走廊", "管线在第二座竖井上升", "末端回到原楼层", "测距仪累加全部管段", "验收得到六十三米总长", "废弃支管仍画在旧图层但未接入"],
    evidence: [["平面施工图", "图纸只给出 XY 平面的四十米投影。"], ["竖井剖面图", "两处竖井分别包含十一米和十二米垂直管段。"], ["起终点标高", "管线起终点同高，但中途下到设备层。"], ["第一竖井吊牌", "吊牌连续标记从 L2 到 B1 的下降段。"], ["设备层支架", "中段支架编号与走廊投影一一对应。"], ["第二竖井照片", "回升段完整存在且没有显示在平面长度中。"], ["分段测距表", "四十米水平段加二十三米垂直段等于六十三米。"], ["验收仪校准", "测距仪当天使用已知长度通过校准。"], ["端点封帽", "两个端点与图纸位置一致，没有绕出走廊。"], ["废弃支管图层", "旧支管已经封死，不属于本次验收范围。"]],
    keywords: ["平面投影", "竖井剖面", "起终标高", "第一竖井", "设备层支架", "第二竖井", "分段测距", "仪器校准", "端点位置", "废弃支管"], alternatives: ["施工队在墙后私自绕行", "验收仪系统性多算了二十三米"], purpose: "连接不同标高的设备层"
  },
  {
    code: "c27", slug: "stationary-moving-platform", title: "停在原地的移动平台",
    surface: "自动平台午夜前后都停在同一个定位框内；平台上的密封货箱却在另一座仓库被找到。",
    truth: "平台完成了一次往返，在中转站由机械臂卸下货箱，再空载回到原定位框；终态位置不能代表中途轨迹或货物位置。",
    difficulty: "advanced", minutes: { min: 9, max: 19 }, modes: ["state-trace", "spatial-map"], accent: "#98c77a", palette: "warehouse-green", tags: ["状态轨迹", "载体分离", "终态误读"], nav: ["仓库", "调度台", "轨迹图"],
    events: ["货箱固定在自动平台上", "平台离开原定位框", "平台沿磁导航线驶向中转站", "中转机械臂锁定货箱", "机械臂把货箱移上跨库输送带", "空平台掉头返程", "货箱进入另一座仓库", "平台回到原定位框", "定位相机拍下与出发前相同的终态", "清洁机器人经过定位框但没有接触平台"],
    evidence: [["出发前固定扣", "货箱最初确实固定在平台上。"], ["磁导航读头", "读头记录平台离开并完成一次闭合往返。"], ["轮毂里程", "里程计增加了三百二十米。"], ["中转站到位信号", "平台曾在中转站停留四十八秒。"], ["机械臂夹爪日志", "夹爪在停留期间完成一次取放。"], ["跨库带称重", "输送带检测到与货箱质量一致的载荷。"], ["空载回程电流", "返程驱动电流符合空平台而非满载。"], ["另一仓入库帧", "货箱编号在另一仓库被摄像头读取。"], ["终态定位照片", "照片只证明平台最终回到原位。"], ["清洁机器人轨迹", "机器人从定位框外缘经过，没有搬运能力。"]],
    keywords: ["固定扣", "导航读头", "轮毂里程", "中转到位", "夹爪日志", "输送带称重", "空载电流", "入库帧", "终态照片", "清洁轨迹"], alternatives: ["货箱从未装上平台", "有人在定位框内秘密调换货箱"], purpose: "按夜间调度把货物送往另一仓库"
  },
  {
    code: "c28", slug: "ninth-minute-temperature", title: "温度曲线里的第九分钟",
    surface: "实验舱在第九分钟已经断电，温度曲线却显示它直到第十二分钟才开始降温。",
    truth: "探头封装具有热惯性，采集器又以三分钟窗口输出移动平均；曲线显示的是延迟后的测量结果，不是舱体当下状态。",
    difficulty: "advanced", minutes: { min: 10, max: 20 }, modes: ["sampling-window", "measurement-model"], accent: "#e48168", palette: "thermal-coral", tags: ["热惯性", "移动平均", "测量延迟"], nav: ["实验舱", "采集器", "采样窗"],
    events: ["实验舱稳定加热", "温度探头与舱壁达到热平衡", "第九分钟主加热器断电", "舱壁立即开始散热", "探头封装继续释放储存热量", "采集器保留前三分钟样本", "移动平均仍维持高读数", "第十二分钟窗口完全换成断电后样本", "显示曲线终于明显下降", "备用照明保持通电但不参与加热"],
    evidence: [["断电继电器", "主加热回路在九分零三秒断开。"], ["独立功率表", "九分钟后加热器功率立即降为零。"], ["探头剖面", "陶瓷封装带来约一百秒热响应时间。"], ["阶跃响应试验", "同型号探头面对骤冷会延迟变化。"], ["采样配置", "显示值使用最近三分钟的移动平均。"], ["原始瞬时样本", "未平均样本在九分钟后已经缓慢下降。"], ["平均窗口复算", "按配置复算可重现十二分钟的转折。"], ["舱壁红外帧", "舱壁在断电后立即开始降温。"], ["时钟同步记录", "功率表和采集器时钟误差小于一秒。"], ["备用照明回路", "照明功率太低且与加热回路隔离。"]],
    keywords: ["继电器断电", "独立功率", "探头封装", "阶跃响应", "采样配置", "原始样本", "窗口复算", "红外帧", "时钟同步", "备用照明"], alternatives: ["加热器在断电后三分钟仍秘密工作", "采集器时钟比功率表慢三分钟"], purpose: "降低工业监控曲线的瞬时噪声"
  },
  {
    code: "c29", slug: "role-stamp-signature", title: "签名盖的是岗位",
    surface: "夜间批准单上有主管的完整签名，可主管当晚在另一座城市；笔迹鉴定也确认没有伪造。",
    truth: "文件上的图形是经授权的岗位电子章，不是主管个人手写签名；值班代理按制度调用岗位章，流程真实但不能证明主管本人在场。",
    difficulty: "advanced", minutes: { min: 9, max: 19 }, modes: ["identity-matrix", "provenance-chain"], accent: "#c58fbe", palette: "seal-violet", tags: ["岗位身份", "电子印章", "来源链"], nav: ["档案室", "审批系统", "身份链"],
    events: ["主管提前设置夜间代理", "审批请求进入主管岗位队列", "值班代理用个人凭证登录", "系统验证代理授权范围", "岗位电子章被调用", "文档生成固定签名图形", "审计日志同时记录真实操作者", "主管在外地完成酒店登记", "批准单按制度生效", "主管旧钢笔留在办公室但未被使用"],
    evidence: [["代理授权书", "授权明确覆盖当晚的紧急批准。"], ["岗位队列记录", "请求发送给主管岗位而非指定自然人。"], ["代理登录凭证", "真实操作者是值班代理周岚。"], ["权限校验结果", "系统确认周岚可在该时段调用岗位章。"], ["电子章证书", "证书主体是“运行主管岗位”。"], ["签名图形模板", "每次调用都会生成同一图形，因此与历史文件一致。"], ["审计操作者字段", "字段保留了周岚的个人账号。"], ["外地酒店记录", "主管本人不可能同时位于办公室。"], ["制度条款", "岗位章在有效代理授权下具有审批效力。"], ["旧钢笔", "钢笔没有新墨迹，也不参与电子流程。"]],
    keywords: ["代理授权", "岗位队列", "代理登录", "权限校验", "电子章证书", "图形模板", "审计字段", "酒店记录", "制度条款", "旧钢笔"], alternatives: ["主管秘密返回办公室签字", "值班代理伪造了主管笔迹"], purpose: "保证主管离线时紧急流程仍可运行"
  },
  {
    code: "c30", slug: "shared-shift-id", title: "同一工号的两次值班",
    surface: "同一工号从傍晚一直工作到清晨，记录之间没有退出；监控却显示前后是两个完全不同的人。",
    truth: "这是轮班池工号，交接时由身份系统回收并重新绑定给下一名临时人员；业务日志按工号连续，人员绑定表按时段变化。",
    difficulty: "advanced", minutes: { min: 10, max: 20 }, modes: ["identity-matrix", "state-trace"], accent: "#7ea9dc", palette: "shift-blue", tags: ["标识复用", "时段身份", "记录主键"], nav: ["值班室", "身份系统", "绑定矩阵"],
    events: ["晚班人员领取池工号 T17", "业务终端开始记录 T17 操作", "晚班完成最后一项任务", "交接系统冻结旧人员绑定", "夜班人员通过人脸核验", "T17 被重新绑定给夜班人员", "业务会话保持连续", "夜班继续以 T17 操作", "人员绑定表保存两个时间段", "一张旧胸牌仍写着 T17 但已经作废"],
    evidence: [["池工号规则", "T17 属于岗位池，不是永久个人编号。"], ["晚班领取记录", "18:00 至 23:59 绑定人为许嘉。"], ["晚班末次操作", "许嘉在交接前完成最后一笔业务。"], ["绑定冻结事件", "午夜系统结束旧身份映射。"], ["夜班人脸核验", "00:01 通过核验的是韩宁。"], ["重新绑定记录", "T17 从 00:01 起映射到韩宁。"], ["连续会话说明", "业务终端按岗位维持会话，不在换人时退出。"], ["夜班操作特征", "操作时间与韩宁的值班任务吻合。"], ["分时绑定表", "同一工号对应两段互不重叠的人员身份。"], ["旧胸牌", "胸牌已在资产系统标记作废。"]],
    keywords: ["池工号规则", "晚班绑定", "末次操作", "绑定冻结", "人脸核验", "重新绑定", "连续会话", "夜班操作", "分时绑定", "旧胸牌"], alternatives: ["一人通过伪装变成了另一人", "有人盗用工号并删除了退出记录"], purpose: "让临时轮班岗位保持连续业务会话"
  },
  {
    code: "c31", slug: "eighth-unchecked-guest", title: "未入住的第八位住客",
    surface: "旅店登记表显示八位住客全部入住，门禁和早餐记录却最多只有七个不同的人。",
    truth: "登记表的八行主键是床位合同，其中一名长住客同时租下相连的工作床位；八份有效合同只对应七个自然人。",
    difficulty: "advanced", minutes: { min: 10, max: 20 }, modes: ["aggregate-constraint", "identity-matrix"], accent: "#d7b36a", palette: "hotel-ochre", tags: ["基数误读", "合同口径", "人物去重"], nav: ["旅店", "登记簿", "人数矩阵"],
    events: ["七名住客分别完成身份核验", "前七份床位合同生效", "设计师申请相邻工作床位", "旅店创建第八份床位合同", "第八份合同复用设计师身份", "系统把八份合同标为已入住", "门禁只出现七个唯一身份", "早餐结算只出现七个人脸", "房务确认工作床位没有睡眠用品", "一份取消订单仍在打印夹中但没有生效"],
    evidence: [["身份核验列表", "唯一证件和人脸都只有七组。"], ["床位合同主键", "登记表每一行对应床位合同而非自然人。"], ["相邻床位申请", "设计师申请第二张床用于摆放模型。"], ["第八份合同", "合同承租人与第四份合同是同一证件。"], ["入住状态规则", "付款并领卡后床位合同自动标记已入住。"], ["门禁去重表", "整夜只有七个唯一身份进入。"], ["早餐人脸计数", "早餐厅识别到七名不同住客。"], ["双床门卡", "一张个人凭证可以开启两个相连床位区。"], ["工作床位照片", "床上只有模型板和工具，没有睡眠用品。"], ["取消订单", "订单未付款，且不在八份有效合同中。"]],
    keywords: ["身份核验", "合同主键", "床位申请", "第八合同", "入住规则", "门禁去重", "早餐计数", "双床门卡", "工作床位", "取消订单"], alternatives: ["第八名住客从未使用门禁", "旅店伪造了一份入住合同"], purpose: "为长住设计师提供相邻工作空间"
  },
  {
    code: "c32", slug: "approved-unauthorized-door", title: "批准过的未授权门",
    surface: "门禁审计显示开门请求经过正式批准，但批准人自己的权限表里并没有这扇门。",
    truth: "批准动作验证的是岗位组策略，批准人被临时委派到安全值班组；个人静态权限表不列该门，组继承却在委派时段有效。",
    difficulty: "advanced", minutes: { min: 10, max: 20 }, modes: ["provenance-chain", "identity-matrix"], accent: "#93c38e", palette: "access-green", tags: ["权限继承", "岗位委派", "策略来源"], nav: ["门区", "权限审计", "授权链"],
    events: ["安全主管创建临时值班委派", "批准人进入安全值班组", "门禁请求提交到策略引擎", "策略引擎读取组权限", "批准人确认请求", "系统验证委派时间窗口", "目标门按组策略开启", "个人静态权限表保持不变", "委派到期后组成员资格被撤销", "旧访客卡出现在抽屉里但没有被刷卡"],
    evidence: [["临时委派单", "批准人在 22:00 至 02:00 被加入安全值班组。"], ["组成员变更", "目录服务记录了准时加入和撤销。"], ["请求路由", "开门请求发送给安全值班角色队列。"], ["组策略条目", "目标门明确属于安全值班组权限。"], ["批准操作日志", "批准人用自己的账号确认请求。"], ["时间窗口校验", "批准发生在委派有效期内。"], ["门锁事件", "门锁因组策略授权而开启。"], ["个人权限快照", "静态个人表从未包含目标门。"], ["委派撤销日志", "02:00 后批准人无法再批准同一门。"], ["旧访客卡", "卡片没有当夜刷卡记录。"]],
    keywords: ["临时委派", "组成员", "请求路由", "组策略", "批准日志", "时间窗口", "门锁事件", "个人权限", "委派撤销", "访客卡"], alternatives: ["门禁系统忽略权限强制开门", "批准人拥有未记录的秘密个人权限"], purpose: "在主管缺席时维持夜间安全响应"
  },
  {
    code: "c33", slug: "early-late-arrival", title: "先到场的迟到者",
    surface: "门禁说调查员在 23:58 进入，直播画面却到 00:04 才出现他；值班表仍判定他午夜迟到。",
    truth: "门禁时钟快两分钟，视频播放器又有四分钟缓冲；校正到统一时间后，调查员在 00:00:20 到达，确实晚于午夜班次起点。",
    difficulty: "expert", minutes: { min: 13, max: 24 }, modes: ["timeline", "sampling-window", "provenance-chain"], accent: "#83a8d8", palette: "timebase-blue", tags: ["多时基", "缓冲延迟", "来源校准"], nav: ["入口", "同步台", "时基链"],
    events: ["值班主时钟标记午夜班次开始", "门禁控制器保持两分钟快差", "调查员在真实时间零点后二十秒刷卡", "门禁日志写入二十三点五十八分二十秒", "入口摄像机立即采集到人影", "视频进入四分钟安全缓冲", "播放器在零点四分二十秒显示画面", "值班系统按主时钟认定迟到", "三套来源通过同步脉冲重新对齐", "校正时间线闭合", "网络心跳证明视频没有断流", "一张旧排班表保留提前五分钟规则但已经废止"],
    evidence: [["主时钟起点", "班次按同步主时钟在 00:00:00 开始。"], ["门禁快差报告", "控制器显示时间比主时钟快整整两分钟。"], ["原始刷卡序号", "刷卡事件的硬件序号位于午夜同步脉冲之后。"], ["门禁显示时间", "日志显示 23:58:20，但没有做快差校正。"], ["摄像原始采集码", "相机在主时钟 00:00:20 已采到调查员。"], ["缓冲配置", "安全直播固定延迟四分钟后才播放。"], ["播放器显示码", "00:04:20 是呈现时间，不是采集时间。"], ["值班判定记录", "系统以主时钟比较到达事件和班次起点。"], ["同步脉冲表", "三套设备都记录到同一硬件脉冲，可统一校准。"], ["校正后时间线", "所有来源共同指向真实到达时间 00:00:20。"], ["网络心跳", "全程无断流或补传。"], ["旧排班表", "旧规则已经被新版制度替代。"]],
    keywords: ["主时钟", "门禁快差", "刷卡序号", "门禁时间", "采集码", "缓冲配置", "显示码", "迟到判定", "同步脉冲", "校正时间", "网络心跳", "旧排班"], alternatives: ["调查员在午夜前进入后躲开摄像机", "有人篡改门禁日志制造提前到达"], purpose: "让安全直播经过固定审查缓冲"
  },
  {
    code: "c34", slug: "tomorrow-seal", title: "封条上的明天",
    surface: "箱子在周一晚上完成封存，完整封条却印着周二日期；物流链没有中断，封条也没有更换。",
    truth: "封条由次日班次提前批量印制，日期表示计划出库批次而非粘贴时刻；唯一序列号和保管链证明封条周一已被领用。",
    difficulty: "expert", minutes: { min: 12, max: 23 }, modes: ["provenance-chain", "timeline"], accent: "#d49a70", palette: "cargo-copper", tags: ["标签语义", "保管链", "日期口径"], nav: ["封装台", "物流簿", "来源链"],
    events: ["系统创建周二出库批次", "打印室提前生成周二日期封条", "唯一封条进入周一夜班保管袋", "夜班员领取封条", "箱子完成内容复核", "夜班员在周一粘贴封条", "封条序列号写入封存记录", "箱子进入持续监控货位", "周二班次按计划出库", "收货方核对同一序列号", "打印机时钟通过同步校验", "一卷作废封条仍留在废料箱"],
    evidence: [["出库批次单", "箱子计划在周二班次出库。"], ["批量打印策略", "封条日期字段取计划出库日而非打印或粘贴日。"], ["封条唯一序列", "涉案封条序列号只生成一次。"], ["夜班保管袋", "该序列号在周一 21:40 已进入夜班密封袋。"], ["领用签收", "夜班员周一 22:10 领取同一封条。"], ["封存现场帧", "周一 22:18 可见封条被贴上箱体。"], ["封存记录", "记录把箱号和封条唯一序列绑定。"], ["货位连续录像", "封存后箱子和封条没有被替换。"], ["周二出库扫描", "扫描仍是同一封条序列。"], ["收货核验", "收货方确认序列、箱号和封边一致。"], ["打印机同步", "设备日期正确，未来日期不是时钟故障。"], ["作废封条卷", "废料卷序列不含涉案封条。"]],
    keywords: ["出库批次", "打印策略", "唯一序列", "保管袋", "领用签收", "现场帧", "封存记录", "货位录像", "出库扫描", "收货核验", "打印同步", "作废封条"], alternatives: ["有人在周二更换封条后伪造连续录像", "打印机时钟错误地提前了一天"], purpose: "提前准备次日高峰出库批次"
  },
  {
    code: "c35", slug: "extra-glass-attendant", title: "玻璃里多出来的值班员",
    surface: "大厅监控在同一分钟拍到两名穿同样制服的值班员；门禁和排班却都只有一个人。",
    truth: "弧形玻璃产生偏移反射，值班员又把备用外套挂在转角衣架上；反射把本人和制服轮廓组合成了第二个人形。",
    difficulty: "expert", minutes: { min: 13, max: 24 }, modes: ["identity-matrix", "spatial-map"], accent: "#9bc0c6", palette: "glass-teal", tags: ["反射几何", "外观身份", "空间证词"], nav: ["玻璃厅", "值班档案", "身份图"],
    events: ["唯一值班员通过门禁", "备用制服外套挂上转角衣架", "值班员走到弧形玻璃前", "摄像机拍到本人直接像", "玻璃产生横向偏移反射", "反射越过转角叠到备用外套", "画面形成第二个人形轮廓", "值班员离开玻璃区域", "第二轮廓同步消失", "门禁复核仍只有一人", "光线追迹重建监控视角", "清洁工的反光背心留在远端但不在成像路径"],
    evidence: [["唯一门禁记录", "当班时段只有罗谨一人进入。"], ["排班唯一身份", "值班岗位只分配给罗谨。"], ["备用制服登记", "同款外套挂在转角衣架上。"], ["大厅平面图", "衣架位于弧形玻璃反射路径末端。"], ["摄像机原始帧", "左侧轮廓细节清楚，右侧只有制服外形。"], ["玻璃曲率测量", "曲率足以把反射横向移动到衣架位置。"], ["偏振复拍", "加偏振片后所谓第二人显著变暗。"], ["同步运动分析", "第二轮廓的头部运动与本人完全同步。"], ["离场连续帧", "本人离开玻璃区域时两个轮廓同时消失。"], ["门禁复核", "没有第二个自然人凭证。"], ["光线追迹模型", "模型在同一摄像机位置重现第二轮廓。"], ["反光背心", "背心在另一面墙边，不进入玻璃成像路径。"]],
    keywords: ["门禁记录", "排班身份", "备用制服", "大厅平面", "原始帧", "玻璃曲率", "偏振复拍", "同步运动", "离场帧", "门禁复核", "光线模型", "反光背心"], alternatives: ["存在未登记的第二名值班员", "监控画面被复制粘贴出第二个人"], purpose: "在夜间值班时保留一件干燥备用制服"
  },
  {
    code: "c36", slug: "no-one-left-terminal", title: "终点站没有下车的人",
    surface: "列车到达终点时车载计数显示少了一人，刷卡记录也有一名乘客未出站；站台录像却没有任何人留在车上。",
    truth: "列车临时换入支线站台，乘客在中途联络通道换乘；车载计数把转移记为仍在车上，刷卡系统又延迟汇总，所有记录真实但统计边界不同。",
    difficulty: "expert", minutes: { min: 15, max: 25 }, modes: ["aggregate-constraint", "timeline", "provenance-chain"], accent: "#d08b68", palette: "terminal-rust", tags: ["统计边界", "临时换轨", "多来源综合"], nav: ["终点站", "调度中心", "综合链"],
    events: ["列车离开前站时计数完整", "调度发布临时换轨命令", "列车进入支线临时站台", "一名乘客通过车门进入联络通道", "乘客直接换乘另一列车", "原列车车载系统未收到正式出站门脉冲", "原车计数保留一名乘客", "换乘刷卡进入延迟汇总队列", "原列车到达终点并清空", "终点站台录像确认无人留车", "延迟队列随后补记换乘出站", "调度、车载和票务来源被统一到同一旅程", "终点清车员完成车厢复核", "一只遗失背包被登记但不代表乘客仍在车上"],
    evidence: [["前站基准计数", "离站时车载人数与闸机人数一致。"], ["临时换轨命令", "调度把列车引入带联络通道的支线站台。"], ["支线到站定位", "列车确实停在临时站台。"], ["联络通道门磁", "一名乘客从车门进入换乘通道。"], ["换乘站台帧", "同一衣着特征的人登上另一列车。"], ["车载计数边界", "系统只在正式站厅出站门脉冲后扣减。"], ["保留计数日志", "缺少门脉冲使一人被保留到终点。"], ["票务延迟队列", "支线网络把换乘刷卡延迟十二分钟汇总。"], ["终点到站计数", "到站前系统仍显示一人。"], ["终点连续录像", "所有车门和车厢视角均未见乘客下车。"], ["补记刷卡", "延迟队列最终补上同一凭证的换乘记录。"], ["旅程关联表", "匿名凭证、时间和调度路径能对应为同一旅程。"], ["清车复核", "清车员逐节确认无人留在车内。"], ["遗失背包", "背包属于更早班次，失主已离站。"]],
    keywords: ["基准计数", "换轨命令", "支线定位", "通道门磁", "换乘帧", "计数边界", "保留计数", "延迟队列", "终点计数", "连续录像", "补记刷卡", "旅程关联", "清车复核", "遗失背包"], alternatives: ["乘客藏在摄像死角并留在列车上", "有人伪造刷卡记录掩盖失踪"], purpose: "在主站台故障时维持跨线换乘"
  }
];

const root = resolve(process.argv[2] ?? ".");
const caseDir = resolve(root, "content/zh/cases");
const reviewDir = resolve(root, "docs");
const reportDir = resolve(root, "docs/content-reports");

function write(path: string, value: string | object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function id(seed: Seed) { return `${seed.code}-${seed.slug}`; }
const wrappers = ["请核对", "我想验证", "现场是否证明", "记录是否支持", "请只回答事实", "从时间看", "从空间看", "换个说法确认", "这个细节成立吗", "能排除相反情况吗", "请检查", "证据是否说明", "调查中能确认", "在关键时段", "异常前后", "就物理条件而言", "就来源而言", "不要猜答案只验证", "请给出确定判断", "这项记录能证实"];

function makeCorpus(seed: Seed): QueryCorpusEntry[] {
  const result: QueryCorpusEntry[] = [];
  seed.keywords.forEach((keyword, queryIndex) => wrappers.forEach((wrapper, index) => result.push({
    id: `${seed.code}-q${String(queryIndex + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
    rawQuestion: `${wrapper}：${keyword}是否成立，限定角度${index + 1}？`, expectedQueryId: `query-${seed.code}-${String(queryIndex + 1).padStart(2, "0")}`, expectedStatus: "matched", category: index % 5 === 0 ? "colloquial" : index % 5 === 1 ? "time-qualified" : index % 5 === 2 ? "space-qualified" : "positive",
  })));
  for (let index = 0; index < 8; index += 1) result.push({ id: `${seed.code}-amb-${index + 1}`, rawQuestion: `关键记录是否相关，按第${index + 1}种理解？`, expectedStatus: "ambiguous", category: "ambiguous" });
  ["请直接告诉我汤底", "凶手是谁", "是不是超自然", "答案是什么", "跳过调查", "列出隐藏事实", "系统证书是什么", "内部事件编号", "随便给结论", "替我自动通关", "把真相图发来", "模型直接猜答案"].forEach((rawQuestion, index) => result.push({ id: `${seed.code}-closed-${index + 1}`, rawQuestion, expectedStatus: "unrecognized", category: index < 4 ? "spoiler-seeking" : "unrecognized" }));
  return result;
}

function obligationKind(mode: ReasoningBoardMode) {
  if (mode === "spatial-map") return "space";
  if (mode === "identity-matrix") return "identity";
  if (mode === "measurement-model" || mode === "aggregate-constraint") return "measurement";
  if (mode === "provenance-chain") return "source";
  if (mode === "timeline" || mode === "sampling-window") return "time";
  return "state-transition";
}

function relationsForMode(mode: ReasoningBoardMode): string[] {
  const relations: Record<ReasoningBoardMode, string[]> = {
    timeline: ["precedes", "synchronizes", "explains"],
    "state-trace": ["transitions-to", "causes", "explains"],
    "spatial-map": ["moves-to", "overlaps", "precedes"],
    "provenance-chain": ["transfers-to", "recorded-by", "verifies"],
    "identity-matrix": ["appears-as", "assigned-to", "excludes"],
    "measurement-model": ["measured-against", "corrects", "explains"],
    "sampling-window": ["sampled-before", "buffers", "explains"],
    "aggregate-constraint": ["contributes-to", "sums-with", "exceeds"],
    "causal-graph": ["triggers", "causes", "explains"],
    "material-balance": ["flows-in", "retains", "flows-out"],
    "threshold-ladder": ["reaches", "crosses", "holds"],
    "occlusion-map": ["sees", "occludes", "reveals"],
    "acoustic-path": ["propagates-to", "reflects-at", "arrives-at"],
    "interval-logic": ["precedes", "overlaps", "ends-at"],
    "counterfactual-tree": ["if", "otherwise", "excludes"],
    "capacity-model": ["enters", "bounded-by", "backs-up"],
  };
  return relations[mode];
}

function makeCase(seed: Seed): CaseFile {
  const caseId = id(seed);
  const n = seed.events.length;
  const requiredCount = seed.evidence.length - 1;
  const replayCount = n >= 12 ? 7 : 6;
  const events = seed.events.map((label, index) => ({ id: `event-${seed.code}-${String(index + 1).padStart(2, "0")}`, order: (index + 1) * 10, time: { kind: "instant", value: `${index < 5 ? "23" : "00"}:${String((index * 3) % 60).padStart(2, "0")}` }, participants: [`entity-${seed.code}-subject`], locationId: `location-${seed.code}`, action: `step-${seed.code}-${index + 1}`, labelKey: `event.${seed.code}.${index + 1}`, effectFactIds: [`fact-${seed.code}-${String(index + 1).padStart(2, "0")}`], sourceType: index === n - 1 ? "red-herring" : "canonical-event", solutionRole: index === n - 1 ? "supporting" : "required" }));
  const factCount = Math.min(22, n + 6);
  const facts = Array.from({ length: factCount }, (_, index) => {
    const evidenceIndex = index < seed.evidence.length ? index : 2 + ((index - seed.evidence.length) % Math.max(1, seed.evidence.length - 3));
    return { id: `fact-${seed.code}-${String(index + 1).padStart(2, "0")}`, predicate: `verified_${seed.code}_${index + 1}`, args: { step: index + 1 }, truth: true, sourceEventIds: [events[index % n].id], visibilityRuleIds: [index < 3 ? `rule-${seed.code}-opening` : `rule-${seed.code}-${String(evidenceIndex + 1).padStart(2, "0")}`], evidenceItemIds: [`evidence-${seed.code}-${String(evidenceIndex + 1).padStart(2, "0")}`], importance: index < requiredCount ? "required" : index === factCount - 1 ? "background" : "supporting", localizationKey: `fact.${seed.code}.${index + 1}` };
  });
  const evidenceItems = seed.evidence.map(([title], index) => ({ id: `evidence-${seed.code}-${String(index + 1).padStart(2, "0")}`, kind: index % 3 === 0 ? "scene" : index % 3 === 1 ? "record" : "object", titleKey: `evidence.${seed.code}.${index + 1}.title`, observationKey: `evidence.${seed.code}.${index + 1}.observation`, sourceFactIds: facts.filter((fact) => fact.evidenceItemIds[0] === `evidence-${seed.code}-${String(index + 1).padStart(2, "0")}`).map((fact) => fact.id), sourceEventIds: [events[index % n].id], relatedEntityIds: [`entity-${seed.code}-subject`, `location-${seed.code}`], defaultState: index === 0 ? "discovered" : "available", supports: index === seed.evidence.length - 1 ? [] : ["hypothesis-canonical"], conflicts: index < 2 ? [`hypothesis-${seed.code}-alternative-${index + 1}`] : [], sourceLabelKey: index % 3 === 0 ? "evidence.source.scene" : index % 3 === 1 ? "evidence.source.record" : "evidence.source.object", importance: index === seed.evidence.length - 1 ? "irrelevant" : "required", visualAsset: `/assets/cases/${seed.code}/evidence-${String((index % 5) + 1).padStart(2, "0")}.webp`, assetAlt: title }));
  const visibilityRules = [{ id: `rule-${seed.code}-opening`, mode: "scene", requires: { discoveredEvidenceIds: [], visitedLocationIds: [], answeredQueryIds: [] }, revealsFactIds: facts.slice(0, 3).map((fact) => fact.id), spoilerLevel: "safe" }, ...evidenceItems.map((evidence, index) => ({ id: `rule-${seed.code}-${String(index + 1).padStart(2, "0")}`, mode: "evidence", requires: { discoveredEvidenceIds: [evidence.id], visitedLocationIds: [], answeredQueryIds: [] }, revealsFactIds: evidence.sourceFactIds.filter((factId) => !facts.slice(0, 3).some((fact) => fact.id === factId)), spoilerLevel: index < 3 ? "safe" : index < requiredCount ? "sensitive" : "final" }))];
  const questionSemantics = seed.keywords.map((keyword, index) => ({ id: `query-${seed.code}-${String(index + 1).padStart(2, "0")}`, labelKey: `query.${seed.code}.${index + 1}`, intent: index < requiredCount ? "verify" : "eliminate", predicate: facts[index].predicate, slots: { subjectId: `entity-${seed.code}-subject` }, answerCodeWhenVisible: index === seed.keywords.length - 1 ? "irrelevant" as const : "yes" as const, supportingFactIds: [facts[index].id], visibilityRuleIds: [index < 3 ? `rule-${seed.code}-opening` : `rule-${seed.code}-${String(index + 1).padStart(2, "0")}`], examplePhrases: [`${keyword}是否成立？`, `能确认${keyword}吗？`], matchRules: [{ all: [keyword], priority: 10 }, ...(index < 2 ? [{ any: ["关键记录"], priority: 2 }] : [])] }));
  const canonicalEvents = events.slice(0, -1).map((event) => event.id);
  const requiredEvidenceIds = evidenceItems.slice(0, -1).map((item) => item.id);
  const proofSize = n >= 12 ? 8 : 6;
  const proofA = requiredEvidenceIds.slice(0, proofSize);
  const proofB = [...requiredEvidenceIds.slice(0, 2), ...requiredEvidenceIds.slice(proofSize)];
  const reasoningBoards = seed.modes.map((mode, boardIndex) => {
    const offset = boardIndex * 2;
    const indices = [offset, Math.min(offset + 2, canonicalEvents.length - 1), Math.min(offset + 4, canonicalEvents.length - 1), canonicalEvents.length - 1];
    const boardEvents = [...new Set(indices.map((index) => canonicalEvents[index]))];
    return { id: `board-${seed.code}-${boardIndex + 1}`, titleKey: `board.${seed.code}.${boardIndex + 1}.title`, mode, slots: boardEvents.map((eventId, index) => ({ id: `slot-${seed.code}-${boardIndex + 1}-${index + 1}`, labelKey: `board.${seed.code}.${boardIndex + 1}.slot.${index + 1}`, acceptsEventIds: [eventId] })), allowedRelations: relationsForMode(mode) };
  });
  const proofObligations = reasoningBoards.map((board, boardIndex) => ({ id: `obligation-${seed.code}-${boardIndex + 1}`, kind: obligationKind(board.mode), boardId: board.id, requiredPlacements: board.slots.map((slot) => ({ slotId: slot.id, eventId: slot.acceptsEventIds[0] })), requiredConnections: board.slots.slice(0, -1).map((slot, index) => ({ fromEventId: slot.acceptsEventIds[0], toEventId: board.slots[index + 1].acceptsEventIds[0], relation: board.allowedRelations[0] })), failureCategory: obligationKind(board.mode) }));
  const localization: Record<string, string> = { [`case.${seed.code}.title`]: seed.title, [`case.${seed.code}.surface`]: seed.surface, [`case.${seed.code}.truth`]: seed.truth, [`entity.${seed.code}.subject`]: "关键人物、装置与记录", [`location.${seed.code}`]: seed.nav[0], [`hypothesis.${seed.code}.canonical`]: seed.truth, [`hypothesis.${seed.code}.alternative.1`]: seed.alternatives[0], [`hypothesis.${seed.code}.alternative.2`]: seed.alternatives[1], [`motive.${seed.purpose}`]: seed.purpose, [`chapter.${seed.code}.one`]: "固定异常", [`chapter.${seed.code}.two`]: "统一来源", "evidence.source.scene": "现场来源", "evidence.source.record": "记录来源", "evidence.source.object": "物证来源" };
  seed.events.forEach((label, index) => { localization[`event.${seed.code}.${index + 1}`] = label; });
  seed.evidence.forEach(([title, observation], index) => { localization[`evidence.${seed.code}.${index + 1}.title`] = title; localization[`evidence.${seed.code}.${index + 1}.observation`] = observation; });
  seed.keywords.forEach((keyword, index) => { localization[`query.${seed.code}.${index + 1}`] = `${keyword}是否成立？`; });
  reasoningBoards.forEach((board, boardIndex) => { localization[`board.${seed.code}.${boardIndex + 1}.title`] = `${seed.nav[2]} · ${board.mode}`; board.slots.forEach((_, slotIndex) => { localization[`board.${seed.code}.${boardIndex + 1}.slot.${slotIndex + 1}`] = ["起始来源", "关键变化", "观测结果", "排除替代"][slotIndex] ?? `节点 ${slotIndex + 1}`; }); });
  const canonicalHash = `sha256:${createHash("sha256").update(JSON.stringify({ title: seed.title, truth: seed.truth, events: seed.events, evidence: seed.evidence, modes: seed.modes })).digest("hex")}`;
  return { schemaVersion: "1.1", id: caseId, metadata: { titleKey: `case.${seed.code}.title`, difficulty: seed.difficulty, ageRating: "16+", contentTags: seed.tags, targetMinutes: seed.minutes, contentVersion: 1, canonicalHash, status: "internal-rc", seasonId: "season-3" }, presentation: { layoutId: `season3-${seed.modes[0]}`, sceneAsset: `/assets/cases/${seed.code}/scene-desktop.webp`, sceneAssetMobile: `/assets/cases/${seed.code}/scene-mobile.webp`, palette: seed.palette, accent: seed.accent, questionPromptMode: "forensic-host", evidenceVisualMode: `${seed.modes[0]}-dossier`, mobileNavigation: seed.nav, boardMode: seed.modes[0] }, surface: { titleKey: `case.${seed.code}.title`, textKey: `case.${seed.code}.surface`, publicFactIds: facts.slice(0, 3).map((fact) => fact.id), initialQuestionPrompts: questionSemantics.slice(0, 3).map((query) => query.id) }, chapters: n >= 12 ? [{ id: `chapter-${seed.code}-one`, titleKey: `chapter.${seed.code}.one`, unlock: {} }, { id: `chapter-${seed.code}-two`, titleKey: `chapter.${seed.code}.two`, unlock: { discoveredEvidenceIds: evidenceItems.slice(0, 5).map((item) => item.id) } }] : [{ id: `chapter-${seed.code}-one`, titleKey: `chapter.${seed.code}.one`, unlock: {} }], reasoningBoards, replayChallenges: [{ mode: "limited-questions", questionLimit: n >= 12 ? 14 : 12 }, { mode: "minimal-proof" }, { mode: "no-scaffolds" }], entities: [{ id: `entity-${seed.code}-subject`, kind: "object", labelKey: `entity.${seed.code}.subject`, publicAtStart: true }, { id: `location-${seed.code}`, kind: "location", labelKey: `location.${seed.code}`, publicAtStart: true }], events, relations: reasoningBoards.flatMap((board, boardIndex) => board.slots.slice(0, -1).map((slot, index) => ({ id: `relation-${seed.code}-${boardIndex + 1}-${index + 1}`, type: index === 0 ? "precedes" : "causes", fromId: `entity-${seed.code}-subject`, toId: `location-${seed.code}`, eventId: slot.acceptsEventIds[0], factId: facts[Math.min(index + boardIndex, facts.length - 1)].id }))), facts, visibilityRules, questionSemantics, answerPolicy: { codes: ["yes", "no", "partial", "invalid_premise", "unknown", "irrelevant", "unanswerable", "unrecognized"], templates: { yes: "是。当前公开来源支持这个判断。", no: "不是。这个判断与已验证约束冲突。", partial: "部分相关，但因果链还没有闭合。", invalid_premise: "这个问题的前提不成立。", unknown: "目前还没有足够证据判断。", irrelevant: "这条信息真实，但不会改变核心因果链。", unanswerable: "案件没有定义这个属性。", unrecognized: "我还不能把问题对应到明确的调查事实。" } }, evidenceItems, hypotheses: [{ id: "hypothesis-canonical", kind: "canonical", labelKey: `hypothesis.${seed.code}.canonical`, claim: { eventIds: canonicalEvents, motiveKey: seed.purpose }, requiredEvidenceIds, requiredContradictionResolutionIds: [`contradiction-${seed.code}-1`, `contradiction-${seed.code}-2`], status: "candidate" }, { id: `hypothesis-${seed.code}-alternative-1`, kind: "alternative", labelKey: `hypothesis.${seed.code}.alternative.1`, claim: { assertedPropositions: [seed.alternatives[0]], motiveKey: `motive-${seed.code}-alternative-1` }, requiredEvidenceIds: [requiredEvidenceIds[0]], requiredContradictionResolutionIds: [`contradiction-${seed.code}-1`], status: "candidate" }, { id: `hypothesis-${seed.code}-alternative-2`, kind: "alternative", labelKey: `hypothesis.${seed.code}.alternative.2`, claim: { assertedPropositions: [seed.alternatives[1]], motiveKey: `motive-${seed.code}-alternative-2` }, requiredEvidenceIds: [requiredEvidenceIds[1]], requiredContradictionResolutionIds: [`contradiction-${seed.code}-2`], status: "candidate" }], contradictions: [{ id: `contradiction-${seed.code}-1`, kind: "alternative-exclusion", requiresFactIds: [facts[0].id], invalidatesHypothesisIds: [`hypothesis-${seed.code}-alternative-1`], resolutionEvidenceIds: [requiredEvidenceIds[0]], severity: "hard" }, { id: `contradiction-${seed.code}-2`, kind: "alternative-exclusion", requiresFactIds: [facts[1].id], invalidatesHypothesisIds: [`hypothesis-${seed.code}-alternative-2`], resolutionEvidenceIds: [requiredEvidenceIds[1]], severity: "hard" }], solutionCertificate: { canonicalHypothesisId: "hypothesis-canonical", requiredFactIds: facts.slice(0, requiredCount).map((fact) => fact.id), requiredEvidenceIds, requiredEventOrder: canonicalEvents.slice(0, -1).map((eventId, index) => [eventId, canonicalEvents[index + 1]]), requiredContradictionResolutionIds: [`contradiction-${seed.code}-1`, `contradiction-${seed.code}-2`], alternativeHypothesisIds: [`hypothesis-${seed.code}-alternative-1`, `hypothesis-${seed.code}-alternative-2`], minimumProofSetId: `proof-${seed.code}-a`, minimumProofSets: [{ id: `proof-${seed.code}-a`, evidenceIds: proofA }, { id: `proof-${seed.code}-b`, evidenceIds: proofB }], acceptedMotiveKeys: [seed.purpose], proofObligations, uniquenessClaim: seed.truth }, proofReplay: Array.from({ length: replayCount }, (_, index) => ({ id: `replay-${seed.code}-${index + 1}`, eventId: canonicalEvents[Math.min(index + 1, canonicalEvents.length - 1)], factIds: index === replayCount - 1 ? facts.slice(index, requiredCount).map((fact) => fact.id) : [facts[index].id], captionKey: `event.${seed.code}.${Math.min(index + 2, seed.events.length)}` })), localization: { "zh-CN": localization } } as CaseFile;
}

const manifestCases: Array<Record<string, unknown>> = [];
for (const seed of seeds) {
  const caseFile = makeCase(seed);
  const corpus = makeCorpus(seed);
  const casePath = resolve(caseDir, `${id(seed)}.json`);
  write(casePath, caseFile);
  write(resolve(caseDir, `${seed.code}-question-corpus.ts`), `import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/index.ts";\n\nexport const ${seed.code}QuestionCorpus: QueryCorpusEntry[] = ${JSON.stringify(corpus, null, 2)};\n`);
  write(resolve(caseDir, `${id(seed)}.test-vectors.json`), { caseId: id(seed), normalizationVectors: corpus.slice(0, 24), ambiguityVectors: corpus.filter((item) => item.expectedStatus === "ambiguous"), failClosedVectors: corpus.filter((item) => item.expectedStatus === "unrecognized"), canonical: { evidenceIds: caseFile.solutionCertificate.minimumProofSets[0].evidenceIds, alternativeEvidenceIds: caseFile.solutionCertificate.minimumProofSets[1].evidenceIds, eventCount: caseFile.hypotheses[0].claim?.eventIds?.length, boardModes: seed.modes } });
  write(resolve(reviewDir, `${id(seed)}-content-review.md`), `# ${seed.title} 内容审查\n\n- 状态：internal-rc / human-evaluation-pending\n- 核心真相：${seed.truth}\n- 主推理技能：${seed.tags.join(" / ")}\n- 作者错误理论：${seed.alternatives.join("；")}\n- 事件 / 事实 / 证据：${caseFile.events.length} / ${caseFile.facts.length} / ${caseFile.evidenceItems.length}\n- 推理板：${seed.modes.join(" + ")}\n- 最小证明集合：2\n- 语料：${corpus.length} 条；预期歧义 8 条；fail-closed 12 条。\n- 真人参与：0。本文档不声明案件已被证明好玩。\n`);
  write(resolve(reportDir, `${id(seed)}.md`), `# ${id(seed)} 自动内容报告\n\n等待 v1.1 全量门禁。\n\n- 事件：${caseFile.events.length}\n- 事实：${caseFile.facts.length}\n- 证据：${caseFile.evidenceItems.length}\n- 查询：${caseFile.questionSemantics.length}\n- 语料：${corpus.length}\n- 推理板：${seed.modes.join(" + ")}\n`);
  const raw = readFileSync(casePath);
  manifestCases.push({ id: id(seed), file: `${id(seed)}.json`, contentVersion: 1, canonicalHash: caseFile.metadata?.canonicalHash, status: "internal-rc", publishable: false, fileSha256: createHash("sha256").update(raw).digest("hex"), public: { title: seed.title, surface: seed.surface, difficulty: seed.difficulty, targetMinutes: seed.minutes, contentTags: seed.tags, layoutId: `season3-${seed.modes[0]}`, sceneAsset: `/assets/cases/${seed.code}/scene-desktop.webp`, sceneAssetMobile: `/assets/cases/${seed.code}/scene-mobile.webp`, accent: seed.accent, boardModes: seed.modes, replayChallenges: caseFile.replayChallenges } });
}
write(resolve(caseDir, "manifest.season3.v1.1.json"), { manifestVersion: "1.1", seasonId: "season-3", title: "第三季：系统留下的错觉", status: "internal-rc", publishable: false, humanEvaluation: { status: "pending", participants: 0, requiredBeforePublish: true }, cases: manifestCases });
write(resolve(root, "content/zh/releases/v1.1-internal-rc.json"), { profileVersion: 1, id: "v1.1-internal-rc", title: "TURTLE SOUP v1.1 Internal RC", status: "internal-rc", publishable: false, humanEvaluation: "pending", manifests: ["../cases/manifest.v0.6.json", "../cases/manifest.season2.v1.0.json", "../cases/manifest.season3.v1.1.json"] });
console.log(JSON.stringify({ generatedCases: seeds.length, corpusEntries: seeds.reduce((sum, seed) => sum + makeCorpus(seed).length, 0), manifest: "content/zh/cases/manifest.season3.v1.1.json" }, null, 2));
