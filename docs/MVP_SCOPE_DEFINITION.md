# 🎯 MVP功能范围定义

## 目的

明确定义MVP (Minimum Viable Product) 的功能边界，避免过度工程化。

---

## ⭐ MVP v1.0 - 核心功能 (2-4周)

### 功能清单

#### 1. 无认证的局创建 ✅
**用户故事**: 作为组织者，我想快速创建一个羽毛球局并分享给朋友。

**验收标准**:
- [ ] 可以填写局名、时间、地点、最大人数
- [ ] 自动生成6位分享码 (如: `ABC123`)
- [ ] 显示组织者密钥并提示保存
- [ ] 创建成功后跳转到分享界面

**技术实现**:
```typescript
POST /api/mvp-sessions
{
  "name": "北京-2025-01-30-19:00",
  "scheduledAt": "2025-01-30T19:00:00Z",
  "location": "朝阳体育馆",
  "maxPlayers": 20,
  "ownerName": "张三",
  "ownerDeviceId": "ios-a3f2-1p42k3"
}

Response:
{
  "session": { ... },
  "shareCode": "ABC123",
  "organizerSecret": "X7K9P2", // ⚠️ 只返回一次
  "shareUrl": "https://app.com/join/ABC123"
}
```

**预估工作量**: 3天

---

#### 2. 分享链接功能 ✅
**用户故事**: 作为组织者，我想通过微信/WhatsApp分享局链接。

**验收标准**:
- [ ] 点击"分享"按钮后显示分享选项
- [ ] 支持复制链接到剪贴板
- [ ] 支持分享到微信(中文消息)
- [ ] 支持分享到WhatsApp(英文消息)
- [ ] 显示已加入人数实时更新

**技术实现**:
```typescript
// 分享消息模板 - 微信
const wechatMessage = `
🏸 羽毛球活动邀请

📅 时间: ${session.scheduledAt}
📍 地点: ${session.location}
👥 人数: ${currentPlayers}/${session.maxPlayers}

👉 点击加入: https://app.com/join/${shareCode}
`;

// 分享消息模板 - WhatsApp
const whatsappMessage = `
🏸 Badminton Session Invitation

📅 Time: ${session.scheduledAt}
📍 Location: ${session.location}
👥 Players: ${currentPlayers}/${session.maxPlayers}

👉 Join here: https://app.com/join/${shareCode}
`;
```

**预估工作量**: 2天

---

#### 3. 快速加入机制 ✅
**用户故事**: 作为球员，我想通过链接快速加入局，只需输入姓名。

**验收标准**:
- [ ] 点击分享链接自动打开App/网页
- [ ] 显示局的基本信息(时间、地点、人数)
- [ ] 输入姓名后可立即加入
- [ ] 加入成功后显示参与者列表
- [ ] 实时看到其他人加入

**技术实现**:
```typescript
GET /api/mvp-sessions/:shareCode
// 返回局信息

POST /api/mvp-sessions/join/:shareCode
{
  "name": "李四",
  "deviceId": "android-b7k3-2q51m4"
}

// Socket.io实时通知
socket.on('player-joined', (data) => {
  // 更新参与者列表UI
});
```

**预估工作量**: 3天

---

#### 4. 5-8人轮换算法 ✅
**用户故事**: 作为组织者，我想系统自动建议谁该下场休息。

**验收标准**:
- [ ] 自动计算轮换人数(5人→1人, 6人→2人, 7人→3人)
- [ ] 优先轮换打球多的人
- [ ] 打球一样多时，轮流下场
- [ ] 高亮显示建议下场的球员
- [ ] 组织者可手动调整

**技术实现**:
```typescript
// 轮换算法
class RotationEngine {
  calculateNextRotation(players: Player[], courtCount: number) {
    const activePlayers = players.filter(p => p.status === 'ACTIVE');
    const rotationCount = this.getRotationCount(activePlayers.length);

    // 1. 按gamesPlayed降序排序
    const sorted = activePlayers.sort((a, b) =>
      b.gamesPlayed - a.gamesPlayed
    );

    // 2. 选择打得最多的N人
    const toRotate = sorted.slice(0, rotationCount);

    // 3. 如果gamesPlayed相同，考虑wasBenchedLastRound
    // ... 详细逻辑见 docs/rotation-algorithm.md

    return toRotate;
  }
}
```

**预估工作量**: 5天 (包含测试)

---

#### 5. 实时状态显示 ✅
**用户故事**: 作为参与者，我想实时看到其他人的状态变化。

**验收标准**:
- [ ] 新球员加入时，所有人看到更新
- [ ] 球员状态变化时(ACTIVE→RESTING)，实时更新
- [ ] 比赛记录提交后，打球局数实时更新
- [ ] 断线重连后自动同步最新状态

**技术实现**:
```typescript
// Socket.io事件
io.to(`session-${shareCode}`).emit('mvp-session-updated', {
  type: 'player_joined',
  player: newPlayer,
  timestamp: new Date().toISOString()
});

// 前端监听
realTimeService.on('session-updated', (data) => {
  dispatch(updateSession(data.session));
});
```

**预估工作量**: 4天

---

### MVP v1.0 总工作量: **17天** (约3-4周)

---

## ❌ 明确不包含在MVP中的功能

### Phase 2 功能 (1-2个月后)
- 用户注册/登录系统
- 权限管理(局主 vs 队员细粒度权限)
- 大分记录审核流程
- "歇一下"功能(需组织者批准)
- 推送通知

### Phase 3 功能 (3-6个月后)
- 统计排名系统
- 锦标赛管理
- 社交功能(加好友、私信)
- 历史数据分析
- 成就徽章系统

### Phase 4 功能 (6-12个月后)
- 场地预订集成
- 装备管理系统
- AI智能配对
- 企业级功能

---

## 📋 MVP开发checklist

### Week 1: 后端核心API
- [ ] Day 1-2: 简化数据库schema
- [ ] Day 3-4: 创建局API (`POST /api/mvp-sessions`)
- [ ] Day 5: 加入局API (`POST /api/mvp-sessions/join/:shareCode`)

### Week 2: 实时功能
- [ ] Day 1-2: Socket.io集成和测试
- [ ] Day 3-4: 实时状态更新
- [ ] Day 5: 离线队列和重连

### Week 3: 轮换算法
- [ ] Day 1-3: 轮换算法实现
- [ ] Day 4-5: 轮换算法单元测试

### Week 4: 前端UI
- [ ] Day 1-2: 创建局界面
- [ ] Day 3: 分享功能
- [ ] Day 4: 加入界面
- [ ] Day 5: 轮换显示界面

### Week 5: 测试和优化
- [ ] Day 1-2: 集成测试
- [ ] Day 3: 用户验收测试(UAT)
- [ ] Day 4-5: Bug修复和优化

---

## 🎯 成功指标

### 技术指标
- [ ] API响应时间 < 200ms (P95)
- [ ] Socket.io消息延迟 < 500ms
- [ ] 单元测试覆盖率 > 80%
- [ ] 系统可用性 > 99%

### 用户体验指标
- [ ] 创建局时间 < 2分钟
- [ ] 加入局时间 < 30秒
- [ ] 95%用户能理解轮换逻辑
- [ ] 85%用户满意度

### 业务指标
- [ ] 单局平均参与人数 > 8人
- [ ] 分享链接点击率 > 60%
- [ ] 用户留存率 (Day 7) > 40%

---

## 🚫 范围控制原则

### YAGNI (You Aren't Gonna Need It)
- 不实现"将来可能需要"的功能
- 只实现MVP v1.0清单中的功能
- 其他功能等用户反馈后再决定

### 快速迭代
- MVP v1.0 → 发布 → 收集反馈 → 决定Phase 2优先级
- 每2周发布一个小版本
- 每次只添加1-2个新功能

### 用户导向
- 所有功能必须有明确的用户故事
- 功能优先级由用户反馈决定
- 避免技术驱动的功能

---

## 📞 FAQ

**Q: 为什么不在MVP包含锦标赛功能?**
A: 锦标赛是复杂功能(10个表)，MVP先验证核心价值(轮换公平性)。

**Q: 什么时候加认证系统?**
A: Phase 2。MVP先用deviceId验证身份，简化流程。

**Q: 用户数据会丢失吗?**
A: 不会。Phase 2时会将MvpPlayer迁移到User系统。

**Q: 竞品都有社交功能，我们为什么不做?**
A: 先专注差异化功能(智能轮换)，建立口碑后再扩展。

---

**维护**: 每周回顾，根据进度调整
**负责人**: 产品经理 + 技术负责人
**最后更新**: 2025-01-30
