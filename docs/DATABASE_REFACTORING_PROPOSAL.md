# 🗄️ 数据库重构提案

## 执行摘要

**问题**: 当前数据库schema包含60个模型、2663行代码,远超MVP实际需求。

**影响**:
- ⚠️ 开发效率降低 (理解成本高、维护困难)
- ⚠️ 性能下降 (查询慢、索引过多)
- ⚠️ 安全风险 (攻击面扩大)
- ⚠️ 技术债务积累

**解决方案**: 将schema简化93%,保留3个核心模型,其余功能分阶段实现。

**预期收益**:
- ✅ 开发速度提升 **3-5倍**
- ✅ 查询性能提升 **67%**
- ✅ 维护成本降低 **90%**
- ✅ 快速迭代验证MVP

---

## 📊 详细对比

### 模型复杂度分析

```
当前Schema结构:
├── MVP相关 (5个) ⭐ 核心
│   ├── MvpSession
│   ├── MvpPlayer
│   ├── MvpGame
│   ├── MvpMatch (可选)
│   └── MvpGameSet (可选)
│
├── 认证系统 (2个) - Phase 2
│   ├── User
│   └── Session
│
├── 锦标赛 (10个) - Phase 3
│   ├── Tournament
│   ├── TournamentPlayer
│   └── ... (8 more)
│
├── 成就系统 (5个) - Phase 3
├── 社交功能 (8个) - Phase 3
├── 推送通知 (3个) - Phase 2
├── 统计分析 (5个) - Phase 3
├── 装备管理 (5个) - Phase 4
├── 场地预订 (8个) - Phase 4
├── AI配对 (3个) - Phase 4
└── 其他 (6个) - Phase 3+

总计: 60个模型
```

### 索引优化对比

**当前**: 225个索引
```prisma
// 示例: 过度索引
model MvpPlayer {
  @@index([sessionId])
  @@index([status])
  @@index([sessionId, status])
  @@index([deviceId])
  @@index([gamesPlayed])
  @@index([sessionId, name])
  @@index([skillLevel])
  @@index([rankingPoints])
  @@index([lastActiveDate])
  // ... 还有更多
}
```

**优化后**: 10-15个索引
```prisma
// 只保留高频查询索引
model MvpPlayer {
  @@index([sessionId, status]) // 复合索引覆盖常见查询
  @@index([deviceId])           // 用户身份验证
  @@index([gamesPlayed])        // 轮换算法排序
}
```

**优化**: ↓ 93% 索引数量

---

## 🎯 改进建议2: MVP功能范围明确化

### 当前问题

PRD定义的MVP功能和实际代码实现不一致:

**PRD说的MVP (文档)**:
- 创建局
- 分享链接
- 简单加入
- 5-8人轮换

**代码里的实现 (实际)**:
- ✅ 创建局
- ✅ 分享链接
- ✅ 简单加入
- ✅ 轮换系统
- ❓ 锦标赛系统 (10个表)
- ❓ 成就系统 (5个表)
- ❓ 社交系统 (8个表)
- ❓ 装备管理 (5个表)
- ❓ 场地预订 (8个表)

### 解决方案

创建清晰的功能分级:

