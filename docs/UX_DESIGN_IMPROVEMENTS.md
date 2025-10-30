# 📱 用户体验设计改进方案

## 问题诊断

**当前状态**: PRD有功能描述，但缺少详细的用户旅程和交互设计。

**影响**:
- 开发者不清楚具体UI应该长什么样
- 可能导致不一致的用户体验
- 缺少边界情况的处理逻辑

---

## 🎨 核心用户旅程设计

### Journey 1: 组织者创建局

#### 流程图
```
[打开App]
    ↓
[首页 - "创建新局"按钮]
    ↓
[填写表单]
├── 局名 (自动生成建议: "北京-2025-01-30-19:00")
├── 时间选择器 (日期+时间)
├── 地点输入 (支持GPS定位)
├── 最大人数 (默认20，范围5-100)
├── 场地数量 (默认1，范围1-4)
└── 组织者姓名 (必填)
    ↓
[点击"创建"]
    ↓
[⏳ 创建中... (显示loading)]
    ↓
[✅ 创建成功 - 分享界面]
├── 📋 分享码: ABC123 (大字显示)
├── 🔑 组织者密钥: X7K9P2 (⚠️ 红色提示"请截图保存")
├── 🔗 分享链接: https://app.com/join/ABC123
├── [复制链接] 按钮
├── [分享到微信] 按钮
├── [分享到WhatsApp] 按钮
└── [进入局详情] 按钮
```

#### UI设计规范

**创建表单界面**:
```tsx
<Screen>
  <Header title="创建新局" />

  <Form>
    {/* 局名 */}
    <FormField
      label="局名"
      value={sessionName}
      onChange={setSessionName}
      placeholder="北京-2025-01-30-19:00"
      helperText="建议格式: 城市-日期-时间"
    />

    {/* 时间选择 */}
    <DateTimePicker
      label="活动时间"
      value={scheduledAt}
      onChange={setScheduledAt}
      minimumDate={new Date()} // 不能选过去的时间
    />

    {/* 地点 */}
    <FormField
      label="地点"
      value={location}
      onChange={setLocation}
      placeholder="朝阳体育馆"
      rightIcon={<GPSIcon onPress={useCurrentLocation} />}
    />

    {/* 最大人数 */}
    <NumberPicker
      label="最大人数"
      value={maxPlayers}
      onChange={setMaxPlayers}
      min={5}
      max={100}
      step={1}
    />

    {/* 场地数 */}
    <NumberPicker
      label="场地数量"
      value={courtCount}
      onChange={setCourtCount}
      min={1}
      max={4}
      step={1}
      helperText="有几个羽毛球场地可用"
    />

    {/* 组织者姓名 */}
    <FormField
      label="您的姓名"
      value={ownerName}
      onChange={setOwnerName}
      placeholder="张三"
      required
    />

    {/* 提交按钮 */}
    <Button
      title="创建局"
      onPress={handleCreate}
      loading={isCreating}
      disabled={!isFormValid}
      size="large"
    />
  </Form>
</Screen>
```

**分享界面设计**:
```tsx
<Screen>
  <Header title="分享局" />

  {/* 成功提示 */}
  <SuccessBanner
    icon="✅"
    message="局创建成功!"
  />

  {/* 分享码卡片 */}
  <Card style={styles.shareCodeCard}>
    <Text style={styles.label}>分享码</Text>
    <Text style={styles.shareCode}>ABC123</Text>
    <CopyButton text="ABC123" />
  </Card>

  {/* ⚠️ 组织者密钥 - 高亮显示 */}
  <Card style={styles.secretCard} backgroundColor="#FFF3CD">
    <Icon name="key" size={32} color="#856404" />
    <Text style={styles.secretLabel}>组织者密钥 (请保存!)</Text>
    <Text style={styles.secret}>X7K9P2</Text>
    <CopyButton text="X7K9P2" />

    <WarningBox>
      <Text style={styles.warning}>
        ⚠️ 此密钥用于在其他设备上恢复组织者权限
        {'\n'}请截图或抄写保存，关闭后无法再次查看
      </Text>
    </WarningBox>
  </Card>

  {/* 分享链接 */}
  <Card>
    <Text style={styles.label}>分享链接</Text>
    <Text style={styles.url}>
      https://app.com/join/ABC123
    </Text>
    <CopyButton text="https://app.com/join/ABC123" />
  </Card>

  {/* 分享按钮组 */}
  <ButtonGroup>
    <ShareButton
      platform="wechat"
      title="分享到微信"
      icon={<WeChatIcon />}
      onPress={() => shareToWeChat(session)}
    />
    <ShareButton
      platform="whatsapp"
      title="分享到WhatsApp"
      icon={<WhatsAppIcon />}
      onPress={() => shareToWhatsApp(session)}
    />
  </ButtonGroup>

  {/* 进入局 */}
  <Button
    title="进入局详情"
    onPress={goToSessionDetail}
    variant="primary"
    size="large"
  />
</Screen>
```

---

### Journey 2: 球员加入局

#### 流程图
```
[点击分享链接]
    ↓
[App自动打开 / 浏览器打开]
    ↓
[加载局信息...]
    ↓
[局详情预览界面]
├── 🏸 局名: 北京-2025-01-30-19:00
├── 📅 时间: 2025年1月30日 19:00
├── 📍 地点: 朝阳体育馆
├── 👥 人数: 12/20
├── 👤 组织者: 张三
└── [参与者列表预览] (显示前5个)
    ↓
[输入姓名界面]
├── "请输入您的姓名"
├── 输入框 (自动聚焦)
└── [加入] 按钮
    ↓
[⏳ 加入中...]
    ↓
[✅ 加入成功!]
    ↓
[自动跳转到局详情界面]
```

#### UI设计规范

**加入预览界面**:
```tsx
<Screen>
  <Header title="加入局" backButton />

  {/* 局信息卡片 */}
  <Card style={styles.sessionCard}>
    <SessionHeader>
      <Icon name="badminton" size={48} />
      <Title>{session.name}</Title>
    </SessionHeader>

    <InfoRow>
      <Icon name="calendar" />
      <Text>{formatDateTime(session.scheduledAt)}</Text>
    </InfoRow>

    <InfoRow>
      <Icon name="location" />
      <Text>{session.location}</Text>
    </InfoRow>

    <InfoRow>
      <Icon name="users" />
      <Text>
        {session.players.length}/{session.maxPlayers} 人
      </Text>
      <PlayerAvatarStack players={session.players.slice(0, 5)} />
    </InfoRow>

    <InfoRow>
      <Icon name="user" />
      <Text>组织者: {session.ownerName}</Text>
    </InfoRow>
  </Card>

  {/* 参与者预览 */}
  <Section title="已加入">
    <PlayerList players={session.players.slice(0, 5)} />
    {session.players.length > 5 && (
      <Text>还有 {session.players.length - 5} 人...</Text>
    )}
  </Section>

  {/* 加入按钮 */}
  <FixedBottomButton
    title="加入这个局"
    onPress={showNameInput}
    icon="check"
  />
</Screen>
```

**输入姓名界面**:
```tsx
<Modal visible={showNameInput}>
  <ModalContent>
    <Title>输入您的姓名</Title>

    <TextInput
      placeholder="请输入姓名"
      value={playerName}
      onChange={setPlayerName}
      autoFocus
      maxLength={20}
    />

    <ButtonGroup>
      <Button
        title="取消"
        variant="outline"
        onPress={hideNameInput}
      />
      <Button
        title="加入"
        variant="primary"
        onPress={handleJoin}
        disabled={!playerName.trim()}
        loading={isJoining}
      />
    </ButtonGroup>
  </ModalContent>
</Modal>
```

---

### Journey 3: 轮换触发流程

#### 流程图
```
[局详情界面]
    ↓
[组织者点击"轮换"按钮]
    ↓
[计算轮换建议...]
    ↓
[轮换预览界面]
├── 上场球员列表 (8人)
│   ├── 🔴 张三 [5局] ⬇️ 建议下场
│   ├── 🔴 李四 [5局] ⬇️ 建议下场
│   ├── 🟡 王五 [4局]
│   ├── 🟡 赵六 [4局]
│   └── 🟢 孙七 [3局]
│       ...
├── 等待区球员 (2人)
│   ├── ⚪ 钱一 [2局]
│   └── ⚪ 钱二 [2局]
└── 公平性指标: ⭐⭐⭐⭐⭐
    ↓
[组织者确认 / 手动调整]
    ↓
[执行轮换]
    ↓
[✅ 轮换完成 - 所有设备实时更新]
```

#### UI设计规范

**轮换预览界面**:
```tsx
<Screen>
  <Header title="轮换建议" />

  {/* 公平性指标 */}
  <FairnessIndicator
    maxGames={5}
    minGames={2}
    difference={3}
    rating="excellent" // excellent, good, fair, poor
  />

  {/* 上场区域 */}
  <Section title="当前上场 (8人)">
    <PlayerGrid>
      {onCourtPlayers.map(player => (
        <PlayerCard
          key={player.id}
          player={player}
          highlight={shouldRotate(player)} // 建议下场的高亮
          onPress={() => toggleRotation(player)}
        >
          {/* 球员信息 */}
          <PlayerAvatar name={player.name} />
          <PlayerName>{player.name}</PlayerName>
          <GameCount>{player.gamesPlayed}局</GameCount>

          {/* 状态指示器 */}
          {shouldRotate(player) && (
            <Badge color="red">
              ⬇️ 建议下场
            </Badge>
          )}
        </PlayerCard>
      ))}
    </PlayerGrid>
  </Section>

  {/* 等待区域 */}
  <Section title="等待区 (2人)">
    <PlayerList>
      {waitingPlayers.map(player => (
        <PlayerListItem
          key={player.id}
          player={player}
          subtitle={`已打 ${player.gamesPlayed} 局`}
        />
      ))}
    </PlayerList>
  </Section>

  {/* 操作按钮 */}
  <FixedBottomButtons>
    <Button
      title="手动调整"
      variant="outline"
      onPress={enableManualMode}
    />
    <Button
      title="确认轮换"
      variant="primary"
      onPress={confirmRotation}
      loading={isRotating}
    />
  </FixedBottomButtons>
</Screen>
```

**手动调整界面**:
```tsx
<Screen>
  <Header title="手动调整轮换" />

  <Instructions>
    拖动球员卡片到"上场"或"等待"区域
  </Instructions>

  {/* 上场区 (可拖拽) */}
  <DroppableZone
    title="上场区"
    maxPlayers={8}
    onDrop={handleDrop}
  >
    {onCourtPlayers.map(player => (
      <DraggablePlayerCard
        key={player.id}
        player={player}
      />
    ))}
  </DroppableZone>

  {/* 等待区 (可拖拽) */}
  <DroppableZone
    title="等待区"
    onDrop={handleDrop}
  >
    {waitingPlayers.map(player => (
      <DraggablePlayerCard
        key={player.id}
        player={player}
      />
    ))}
  </DroppableZone>

  {/* 保存按钮 */}
  <FixedBottomButton
    title="保存调整"
    onPress={saveManualRotation}
  />
</Screen>
```

---

## 🎨 设计系统规范

### 颜色系统
```typescript
const colors = {
  // 主色调
  primary: '#1E88E5', // 蓝色 - 主要按钮、链接
  secondary: '#43A047', // 绿色 - 成功状态

  // 状态颜色
  success: '#4CAF50', // 成功
  warning: '#FF9800', // 警告
  error: '#F44336', // 错误
  info: '#2196F3', // 信息

  // 轮换状态
  rotate: {
    high: '#F44336', // 红色 - 应该下场
    medium: '#FF9800', // 黄色 - 可能下场
    low: '#4CAF50', // 绿色 - 继续上场
    waiting: '#9E9E9E', // 灰色 - 等待区
  },

  // 中性色
  text: {
    primary: '#212121',
    secondary: '#757575',
    disabled: '#BDBDBD',
  },
  background: {
    default: '#FFFFFF',
    paper: '#F5F5F5',
  },
};
```

### 组件样式规范
```typescript
// 球员卡片样式
const PlayerCard = styled.View`
  background: ${props => getBackgroundColor(props.status)};
  border-radius: 12px;
  padding: 16px;
  margin: 8px;
  shadow-opacity: 0.1;
  shadow-radius: 4px;

  ${props => props.highlight && `
    border: 2px solid ${colors.rotate.high};
    shadow-opacity: 0.3;
  `}
`;

// 按钮样式
const PrimaryButton = styled.TouchableOpacity`
  background: ${colors.primary};
  padding: 16px 32px;
  border-radius: 8px;
  align-items: center;

  ${props => props.disabled && `
    background: ${colors.text.disabled};
    opacity: 0.5;
  `}
`;
```

---

## 💡 交互细节设计

### 1. 加载状态
```tsx
// 创建局时
<Button loading={isCreating}>
  {isCreating ? (
    <>
      <Spinner />
      <Text>创建中...</Text>
    </>
  ) : (
    <Text>创建局</Text>
  )}
</Button>

// 全局loading (用于页面加载)
<LoadingOverlay visible={isLoading}>
  <Spinner size="large" />
  <Text>加载中...</Text>
</LoadingOverlay>
```

### 2. 错误处理
```tsx
// 网络错误
<ErrorBanner
  message="网络连接失败，请检查网络后重试"
  action={{
    label: "重试",
    onPress: retryOperation
  }}
/>

// 表单验证错误
<FormField
  error={errors.name}
  errorMessage="姓名不能为空"
/>
```

### 3. 空状态
```tsx
// 没有球员时
<EmptyState
  icon="users"
  title="还没有人加入"
  description="分享链接邀请朋友一起来打球吧!"
  action={{
    label: "分享链接",
    onPress: showShareModal
  }}
/>
```

### 4. 实时更新动画
```tsx
// 新球员加入时的动画
<Animated.View
  entering={FadeInDown}
  exiting={FadeOutUp}
>
  <PlayerCard player={newPlayer} />
</Animated.View>

// 轮换状态变化动画
<Animated.View
  layout={Layout.springify()}
>
  {/* 球员卡片会平滑移动到新位置 */}
</Animated.View>
```

---

## 📏 响应式设计

### 移动端 (< 768px)
- 单列布局
- 全屏模态框
- 底部固定按钮

### 平板 (768px - 1024px)
- 双列布局
- 侧边栏导航
- 浮动按钮

### 桌面端 (> 1024px)
- 三列布局
- 顶部导航栏
- 内联操作按钮

---

## ♿ 可访问性

### WCAG 2.1 AA标准
- 颜色对比度 ≥ 4.5:1
- 字体大小 ≥ 16px
- 可点击区域 ≥ 44x44px
- 支持屏幕阅读器

### 实现示例
```tsx
<TouchableOpacity
  accessible={true}
  accessibilityLabel="加入局"
  accessibilityHint="点击后输入姓名加入这个局"
  accessibilityRole="button"
>
  <Text>加入</Text>
</TouchableOpacity>
```

---

## 🧪 用户测试计划

### A/B测试场景
1. **分享流程**: 对比"一步分享" vs "两步分享(预览+分享)"
2. **轮换UI**: 对比"列表视图" vs "卡片视图"
3. **加入流程**: 对比"直接加入" vs "预览后加入"

### 可用性测试
- 招募10-15名真实用户
- 观察完成任务的时间和错误率
- 收集定性反馈

---

**维护**: 每个sprint回顾并更新
**负责人**: UI/UX设计师 + 前端开发
**最后更新**: 2025-01-30
