import type {
  AttentionReason,
  LaneId,
  NotificationKind,
  SearchMatchField,
} from '@shared/types';

export type Locale = 'zh' | 'en';

export interface Dictionary {
  appName: string;
  demoMode: string;
  demoTooltip: string;
  liveConnected: string;
  liveConnecting: string;
  liveDisconnected: string;
  lastSynced: string;
  refresh: string;
  searchPlaceholder: string;
  searchTriggerPlaceholder: string;
  searchShortcutHint: string;
  searchServerMatches: (count: number) => string;
  clearFilters: string;
  resetFilters: string;
  allWorkspaces: string;
  noWorkspace: string;
  allTags: string;
  moreTags: (count: number) => string;
  searchTagsPlaceholder: string;
  noMatchingTags: string;
  density: {
    label: string;
    comfortable: string;
    compact: string;
  };
  kanbanSort: {
    label: string;
    smart: string;
    recent: string;
    priority: string;
    steps: string;
  };
  views: {
    kanban: string;
    matrix: string;
    swarm: string;
  };
  notifications: {
    enable: string;
    enabled: string;
    denied: string;
    tooltip: string;
    soundOn: string;
    soundOff: string;
  };
  notificationKinds: Record<NotificationKind, string>;
  searchMatchFields: Record<SearchMatchField, string>;
  settings: {
    title: string;
    staleAfterHours: string;
    staleAfterHint: string;
    pollIntervalMs: string;
    hoursUnit: string;
    save: string;
    saved: string;
    saving: string;
    dataDir: string;
    mode: string;
    shortcutsTitle: string;
    shortcutSearch: string;
    shortcutViews: string;
    shortcutClose: string;
    desktopSection: string;
    desktopAutoStart: string;
    desktopAlwaysOnTop: string;
    desktopShowWidget: string;
  };
  widget: {
    allClear: string;
    runningShort: (n: number) => string;
    attentionShort: (n: number) => string;
    expandTooltip: string;
    collapseTooltip: string;
    openBoardTooltip: string;
    openFullBoard: string;
    pinTopTooltip: string;
    tabFocus: string;
    tabOpen: string;
    tabRunning: string;
    tabAttention: string;
    tabSwarm: string;
    tabArchived: string;
    tabAll: string;
    emptyFocus: string;
    emptyTab: string;
    markReadShort: string;
    previewBadge: string;
    presetS: string;
    presetM: string;
    presetL: string;
    presetSTitle: string;
    presetMTitle: string;
    presetLTitle: string;
    shortError: string;
    shortFeedback: string;
    shortDecision: string;
    shortUnread: string;
    shortDue: string;
    shortFlagged: string;
    hoverHint: string;
    restingTitle: string;
    restingHint: string;
    closePreview: string;
    dropToArchive: string;
    lockedLabel: string;
    unlockTooltip: string;
    latestOutput: string;
    feedbackArtifacts: string;
    pushTitle: string;
    pushPlaceholder: string;
    pushButton: string;
    quickPrompts: [string, string, string];
    dispatchSuccessCli: string;
    dispatchHandoffFocused: string;
    dispatchHandoffCopied: string;
    dispatchFailed: string;
    detailShort: string;
    pushShort: string;
    workingAgentsLabel: string;
    minimizeTooltip: string;
    quitTooltip: string;
    browserMinimizeNotice: string;
    browserQuitNotice: string;
  };
  moveMenu: {
    triggerTooltip: string;
    moveTo: string;
  };
  theme: {
    light: string;
    dark: string;
    switchToLight: string;
    switchToDark: string;
  };
  radar: {
    running: string;
    attention: string;
    swarmsAndAgents: string;
    stale: string;
    tokensAndCache: string;
    cacheHit: string;
    activeFilterHint: string;
    filterActive: string;
    totalConversations: string;
  };
  lanes: Record<LaneId, string> & {
    runningDesc: string;
    attentionDesc: string;
    activeDesc: string;
    staleDesc: string;
    archivedDesc: string;
    manualBadge: string;
    resetAutoLane: string;
    dropHere: string;
    emptyColumn: string;
    expandArchived: string;
    collapseArchived: string;
    markAllRead: string;
  };
  attentionReasons: Record<AttentionReason, string>;
  priority: {
    label: string;
    none: string;
    p0: string;
    p1: string;
    p2: string;
    cycleTooltip: string;
  };
  card: {
    markReviewed: string;
    reviewed: string;
    pin: string;
    unpin: string;
    steps: string;
    swarm: string;
    subagents: string;
    runningNow: string;
    artifacts: string;
    autoLabel: string;
    untitled: string;
    followUpDue: string;
  };
  matrix: {
    groupBy: string;
    groupNone: string;
    groupWorkspace: string;
    groupTag: string;
    groupLane: string;
    sortBy: string;
    sortLastActive: string;
    sortAttention: string;
    sortSteps: string;
    sortTokens: string;
    sortPriority: string;
    colConversation: string;
    colLane: string;
    colWorkspace: string;
    colProgress: string;
    colAgents: string;
    colTokens: string;
    colLastActive: string;
    colActions: string;
    untagged: string;
    empty: string;
    showingCount: (shown: number, total: number) => string;
  };
  swarmView: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyDesc: string;
    goal: string;
    threads: string;
    workers: string;
    recentBoard: string;
    subagents: string;
    openDetail: string;
    noPlanGoal: string;
    statusWorking: string;
    statusWaiting: string;
    statusStopped: string;
    statusKilled: string;
    activeClusters: string;
    workingAgents: string;
    totalSubagents: string;
    boardMessagesCount: (count: number) => string;
  };
  commandPalette: {
    placeholder: string;
    empty: string;
    conversationsSection: string;
    recentSection: string;
    commandsSection: string;
    filterBoardBy: (query: string) => string;
    clearBoardSearch: string;
    navigateHint: string;
    selectHint: string;
    closeHint: string;
    ftsSearching: string;
    cmds: {
      kanban: string;
      matrix: string;
      swarm: string;
      toggleTheme: string;
      toggleLocale: string;
      toggleDensity: string;
      toggleNotifications: string;
      markAllRead: (count: number) => string;
      refresh: string;
      shortcuts: string;
    };
  };
  shortcutsModal: {
    title: string;
    subtitle: string;
    buttonTooltip: string;
    groupNavigation: string;
    groupTriage: string;
    groupDrawer: string;
    openCommandPalette: string;
    switchKanban: string;
    switchMatrix: string;
    switchSwarm: string;
    refreshBoard: string;
    openShortcuts: string;
    prevNextConversation: string;
    closeOverlay: string;
  };
  toasts: {
    undo: string;
    movedToLane: (title: string, lane: string) => string;
    resetAutoLane: (title: string) => string;
    markedReviewed: (title: string) => string;
    markedAllReviewed: (count: number) => string;
    undone: string;
    pinned: (title: string) => string;
    unpinned: (title: string) => string;
    prioritySet: (title: string, priority: string) => string;
    priorityCleared: (title: string) => string;
    copiedId: string;
    copiedPath: string;
    refreshed: string;
  };
  drawer: {
    close: string;
    copyId: string;
    copyPath: string;
    copied: string;
    laneControl: string;
    autoLaneNote: (laneName: string) => string;
    followUpPanel: string;
    editFollowUp: string;
    doneEditing: string;
    addFollowUpHint: string;
    prevConversation: string;
    nextConversation: string;
    tagsLabel: string;
    tagsCount: (count: number) => string;
    addTagPlaceholder: string;
    addTagBtn: string;
    suggestedTags: string;
    notesLabel: string;
    notesPlaceholder: string;
    notesSaving: string;
    notesSaved: string;
    followUpDateLabel: string;
    clearDate: string;
    tabs: {
      overview: string;
      agents: string;
      artifacts: string;
      timeline: string;
    };
    overview: {
      currentFocus: string;
      noFocus: string;
      checklist: string;
      noChecklist: string;
      tokenBreakdown: string;
      inputTokens: string;
      cacheReadTokens: string;
      outputTokens: string;
      totalTokens: string;
      cacheHitRate: string;
      modelsUsed: string;
      noTokenData: string;
      latestPreview: string;
      metadata: string;
      createdOrModified: string;
      lastUserInput: string;
      lastReviewed: string;
      stepCount: string;
      never: string;
      lastErrorTitle: string;
      pendingQuestionTitle: string;
      sideQuestionsTitle: string;
    };
    agents: {
      swarmTitle: string;
      swarmGoal: string;
      threadsTitle: string;
      rosterTitle: string;
      memberName: string;
      memberModel: string;
      memberState: string;
      memberTask: string;
      boardTitle: string;
      noBoardMessages: string;
      subagentsTitle: string;
      noAgents: string;
    };
    artifacts: {
      listTitle: string;
      requestFeedback: string;
      empty: string;
      selectPrompt: string;
      loading: string;
      loadError: string;
      truncatedNotice: string;
      updatedAt: string;
      rawToggle: string;
      renderedToggle: string;
      copyContent: string;
    };
    timeline: {
      empty: string;
      roleUser: string;
      roleAssistant: string;
      roleError: string;
      roleSystem: string;
      expand: string;
      collapse: string;
      toolCalls: string;
      thinking: string;
      stepIndex: (idx: number) => string;
    };
    loadingDetail: string;
    errorDetail: string;
  };
  time: {
    justNow: string;
    secondsAgo: (n: number) => string;
    minutesAgo: (n: number) => string;
    hoursAgo: (n: number) => string;
    daysAgo: (n: number) => string;
  };
  errors: {
    loadFailed: string;
    retry: string;
    updateFailed: string;
  };
}

export const dictionaries: Record<Locale, Dictionary> = {
  zh: {
    appName: 'Antigravity Mission Board',
    demoMode: '演示模式',
    demoTooltip: '当前使用内置合成演示数据运行，未读取本地真实对话。',
    liveConnected: '实时同步',
    liveConnecting: '连接中',
    liveDisconnected: '已断开',
    lastSynced: '同步于',
    refresh: '手动刷新 (R)',
    searchPlaceholder: '搜索对话、正文、工作区、标签或输入命令…',
    searchTriggerPlaceholder: '搜索对话、工作区或运行命令…',
    searchShortcutHint: '⌘K',
    searchServerMatches: (n) => `全文命中 ${n}`,
    clearFilters: '清除筛选',
    resetFilters: '重置筛选',
    allWorkspaces: '全部工作区',
    noWorkspace: '未绑定工作区',
    allTags: '全部标签',
    moreTags: (c) => `+${c} 标签`,
    searchTagsPlaceholder: '筛选标签…',
    noMatchingTags: '无匹配标签',
    density: {
      label: '密度',
      comfortable: '舒适',
      compact: '紧凑',
    },
    kanbanSort: {
      label: '排序',
      smart: '智能推荐',
      recent: '最新活跃',
      priority: '优先级',
      steps: '步数最多',
    },
    views: {
      kanban: '看板',
      matrix: '列表',
      swarm: 'Swarm 集群',
    },
    notifications: {
      enable: '开启桌面提醒',
      enabled: '提醒已开启',
      denied: '浏览器通知权限被拒绝',
      tooltip: '当 Agent 完成任务、需要决策或执行出错时推送桌面通知与提示音',
      soundOn: '提示音已开',
      soundOff: '提示音已关',
    },
    notificationKinds: {
      run_finished: '任务已完成',
      needs_attention: '需要你的关注',
      needs_input: '等待你的决策',
      error: '执行出现错误',
      feedback_requested: '产物等待审阅',
    },
    searchMatchFields: {
      title: '标题',
      preview: '摘要',
      transcript: '对话正文',
      notes: '备注',
      tags: '标签',
      workspace: '工作区',
      project: '项目',
    },
    settings: {
      title: '看板设置',
      staleAfterHours: '久未跟进阈值',
      staleAfterHint: '非运行、非待关注对话超过该时长无更新时自动归入「久未跟进」',
      pollIntervalMs: '后端轮询间隔 (ms)',
      hoursUnit: '小时',
      save: '保存设置',
      saved: '已保存',
      saving: '保存中…',
      dataDir: '数据目录',
      mode: '运行模式',
      shortcutsTitle: '快捷键',
      shortcutSearch: '打开命令面板 / 搜索',
      shortcutViews: '切换看板 / 列表 / Swarm',
      shortcutClose: '关闭抽屉 / 面板',
      desktopSection: '桌面客户端',
      desktopAutoStart: '开机自动启动',
      desktopAlwaysOnTop: '浮窗置顶',
      desktopShowWidget: '显示桌面浮窗',
    },
    widget: {
      allClear: '一切正常',
      runningShort: (n) => `${n} 运行中`,
      attentionShort: (n) => `${n} 待关注`,
      expandTooltip: '展开浮窗面板',
      collapseTooltip: '收起为胶囊',
      openBoardTooltip: '打开完整看板',
      openFullBoard: '打开完整看板',
      pinTopTooltip: '浮窗始终置顶',
      tabFocus: '焦点',
      tabOpen: '未完成',
      tabRunning: '运行中',
      tabAttention: '待关注',
      tabSwarm: 'Swarm',
      tabArchived: '已归档',
      tabAll: '全部',
      emptyFocus: '当前没有未完成的对话',
      emptyTab: '暂无符合条件的对话',
      markReadShort: '已阅',
      previewBadge: '浮窗预览',
      presetS: 'S',
      presetM: 'M',
      presetL: 'L',
      presetSTitle: 'S 胶囊浮窗 (336×52)',
      presetMTitle: 'M 中型纵览 (390×600)',
      presetLTitle: 'L 大型全景 (700×580)',
      shortError: '出错',
      shortFeedback: '待审',
      shortDecision: '决策',
      shortUnread: '未读',
      shortDue: '到期',
      shortFlagged: '关注',
      hoverHint: '悬停预览 · 点击锁定',
      restingTitle: '将鼠标移至左侧任意任务查看详情',
      restingHint: '点击锁定后可快捷推进对话，右键或拖动可自由调整状态列',
      closePreview: '关闭预览 (Esc)',
      dropToArchive: '松开归档此对话',
      lockedLabel: '已锁定',
      unlockTooltip: '取消锁定，恢复悬停跟随',
      latestOutput: '最新进展',
      feedbackArtifacts: '待审产物',
      pushTitle: '快捷推进对话',
      pushPlaceholder: '输入下一步指令，回车推进对话…',
      pushButton: '推进',
      quickPrompts: ['继续推进', '总结当前进展', '检查报错并修复'],
      dispatchSuccessCli: '已通过 agy CLI 派发指令',
      dispatchHandoffFocused: '已复制指令并切到 Antigravity — 直接 Ctrl+V 回车即可推进',
      dispatchHandoffCopied: '已复制指令 — 切到 Antigravity 后 Ctrl+V 回车即可推进',
      dispatchFailed: '推进指令发送失败',
      detailShort: '详情',
      pushShort: '推进',
      workingAgentsLabel: '执行中',
      minimizeTooltip: '最小化到托盘',
      quitTooltip: '彻底关闭程序',
      browserMinimizeNotice: '桌面版会将浮窗最小化到系统托盘',
      browserQuitNotice: '桌面版会彻底关闭 Mission Board 服务与托盘',
    },
    moveMenu: {
      triggerTooltip: '调整状态 / 移至其他列',
      moveTo: '调整任务状态',
    },
    theme: {
      light: '浅色',
      dark: '深色',
      switchToLight: '切换浅色主题',
      switchToDark: '切换深色主题',
    },
    radar: {
      running: '正在运行',
      attention: '待你关注',
      swarmsAndAgents: '活跃 Swarm / 子代理',
      stale: '久未跟进',
      tokensAndCache: '总 Token / 缓存命中',
      cacheHit: '命中率',
      activeFilterHint: '点击筛选',
      filterActive: '已筛选',
      totalConversations: '对话总数',
    },
    lanes: {
      running: '正在运行',
      attention: '待你关注',
      active: '跟进中',
      stale: '久未跟进',
      archived: '已归档',
      runningDesc: 'Agent 或子代理正在执行',
      attentionDesc: '刚完成未读、等你决策、出错或待审产物',
      activeDesc: '近期持续推进中的对话任务',
      staleDesc: '超出阈值未推进，建议回顾或归档',
      archivedDesc: '已归档的历史对话',
      manualBadge: '手动分组',
      resetAutoLane: '恢复自动归类',
      dropHere: '释放移至此列',
      emptyColumn: '暂无对话',
      expandArchived: '展开已归档',
      collapseArchived: '折叠已归档',
      markAllRead: '全部已阅',
    },
    attentionReasons: {
      unread_update: '刚完成未读',
      marked_as_unread: '标为未读',
      needs_input: '等你决策',
      error: '执行出错',
      request_feedback: '待审产物',
      follow_up_due: '跟进到期',
      manual_attention: '手动关注',
    },
    priority: {
      label: '优先级',
      none: '无',
      p0: 'P0 紧急',
      p1: 'P1 高',
      p2: 'P2 常规',
      cycleTooltip: '点击切换优先级 (P0 / P1 / P2 / 无)',
    },
    card: {
      markReviewed: '标为已阅',
      reviewed: '已阅',
      pin: '置顶',
      unpin: '取消置顶',
      steps: '步',
      swarm: 'Swarm',
      subagents: '子代理',
      runningNow: '运行中',
      artifacts: '产物',
      autoLabel: '自动',
      untitled: '未命名对话',
      followUpDue: '跟进',
    },
    matrix: {
      groupBy: '分组',
      groupNone: '不分组',
      groupWorkspace: '按工作区',
      groupTag: '按标签',
      groupLane: '按看板列',
      sortBy: '排序',
      sortLastActive: '最近活跃',
      sortAttention: '待关注优先',
      sortSteps: '步数最多',
      sortTokens: 'Token 消耗',
      sortPriority: '优先级',
      colConversation: '对话 / 当前进展',
      colLane: '状态列',
      colWorkspace: '工作区与标签',
      colProgress: '清单进度',
      colAgents: '集群',
      colTokens: 'Tokens',
      colLastActive: '最后活跃',
      colActions: '操作',
      untagged: '无标签',
      empty: '没有符合当前筛选条件的对话',
      showingCount: (shown, total) => `显示 ${shown} / ${total} 条对话`,
    },
    swarmView: {
      title: 'Swarm & 多代理集群监控',
      subtitle: '聚合所有包含 Swarm 协作编排或子代理的对话任务，实时追踪成员分工与公告板动态。',
      emptyTitle: '当前没有活跃或历史 Swarm / 子代理任务',
      emptyDesc: '当对话中启动 Swarm 编排或调用子代理时，将自动在此处展示集群拓扑与成员状态。',
      goal: '集群目标',
      threads: '任务线进展',
      workers: '成员花名册',
      recentBoard: '公告板最新动态',
      subagents: '嵌套子代理',
      openDetail: '查看完整详情',
      noPlanGoal: '尚未写入 plan.json 目标描述',
      statusWorking: '执行中',
      statusWaiting: '待命',
      statusStopped: '已暂停',
      statusKilled: '已结束',
      activeClusters: '活跃集群',
      workingAgents: '执行中成员',
      totalSubagents: '关联子代理',
      boardMessagesCount: (c) => `${c} 条公告板消息`,
    },
    commandPalette: {
      placeholder: '搜索对话、正文、标签，或输入快速命令…',
      empty: '未找到匹配的对话或命令',
      conversationsSection: '匹配对话',
      recentSection: '最近活跃 / 待关注对话',
      commandsSection: '快捷命令',
      filterBoardBy: (q) => `在看板中筛选 “${q}”`,
      clearBoardSearch: '清除当前看板搜索关键词',
      navigateHint: '选择',
      selectHint: '执行 / 打开',
      closeHint: '关闭',
      ftsSearching: '全文检索中…',
      cmds: {
        kanban: '切换到 看板视图 (Kanban)',
        matrix: '切换到 列表矩阵视图 (Matrix)',
        swarm: '切换到 Swarm 集群视图',
        toggleTheme: '切换 浅色 / 深色主题',
        toggleLocale: '切换界面语言 (中文 / EN)',
        toggleDensity: '切换卡片密度 (舒适 / 紧凑)',
        toggleNotifications: '切换桌面通知提醒',
        markAllRead: (count) => `将全部 ${count} 条待关注对话标为已阅`,
        refresh: '立即刷新看板数据',
        shortcuts: '查看快捷键一览 (?)',
      },
    },
    shortcutsModal: {
      title: '快捷键一览',
      subtitle: '专为高频多任务巡检与秒级分诊设计',
      buttonTooltip: '快捷键 (?)',
      groupNavigation: '全局导航',
      groupTriage: '快速操作',
      groupDrawer: '详情抽屉',
      openCommandPalette: '打开命令面板与全文检索',
      switchKanban: '切换到 看板视图',
      switchMatrix: '切换到 列表矩阵视图',
      switchSwarm: '切换到 Swarm 集群视图',
      refreshBoard: '立即刷新看板数据',
      openShortcuts: '打开快捷键一览',
      prevNextConversation: '切换上一条 / 下一条对话',
      closeOverlay: '关闭详情抽屉 / 命令面板 / 弹窗',
    },
    toasts: {
      undo: '撤销',
      movedToLane: (title, lane) => `已将「${title}」移至 ${lane}`,
      resetAutoLane: (title) => `已恢复「${title}」自动归类`,
      markedReviewed: (title) => `已将「${title}」标为已阅`,
      markedAllReviewed: (count) => `已将 ${count} 条待关注对话全部标为已阅`,
      undone: '已撤销刚才的操作',
      pinned: (title) => `已置顶「${title}」`,
      unpinned: (title) => `已取消置顶「${title}」`,
      prioritySet: (title, p) => `已将「${title}」优先级设为 ${p}`,
      priorityCleared: (title) => `已清除「${title}」优先级`,
      copiedId: '已复制对话 ID',
      copiedPath: '已复制工作区路径',
      refreshed: '看板数据已刷新',
    },
    drawer: {
      close: '关闭 (Esc)',
      copyId: '复制对话 ID',
      copyPath: '复制工作区路径',
      copied: '已复制',
      laneControl: '看板分组',
      autoLaneNote: (laneName) => `自动归类：${laneName}`,
      followUpPanel: '个人跟进与标注',
      editFollowUp: '编辑',
      doneEditing: '收起',
      addFollowUpHint: '添加标签、备注或跟进日期…',
      prevConversation: '上一条对话 (←)',
      nextConversation: '下一条对话 (→)',
      tagsLabel: '自定义标签',
      tagsCount: (c) => `${c} 个标签`,
      addTagPlaceholder: '输入标签按回车…',
      addTagBtn: '添加',
      suggestedTags: '常用标签',
      notesLabel: '跟进备注',
      notesPlaceholder: '记录关键结论、下一步计划或待确认事项（自动保存）…',
      notesSaving: '保存中…',
      notesSaved: '已自动保存',
      followUpDateLabel: '计划跟进日期',
      clearDate: '清除',
      tabs: {
        overview: '概览',
        agents: 'Swarm & 子代理',
        artifacts: '产物',
        timeline: '时间线',
      },
      overview: {
        currentFocus: '当前焦点',
        noFocus: '暂无实时焦点更新',
        checklist: '步骤清单',
        noChecklist: '该对话未记录 update_steps 清单',
        tokenBreakdown: 'Token 与模型统计',
        inputTokens: '输入 Input',
        cacheReadTokens: '缓存命中 Cache Read',
        outputTokens: '输出 Output',
        totalTokens: '总计',
        cacheHitRate: '缓存命中率',
        modelsUsed: '使用模型',
        noTokenData: '暂无 Token 用量记录',
        latestPreview: '最新摘要预览',
        metadata: '基础信息',
        createdOrModified: '最后活跃',
        lastUserInput: '上次用户输入',
        lastReviewed: '上次已阅时间',
        stepCount: '总步骤数',
        never: '未记录',
        lastErrorTitle: '最近一次执行错误',
        pendingQuestionTitle: '等待用户决策的问题',
        sideQuestionsTitle: '关联子问题',
      },
      agents: {
        swarmTitle: 'Swarm 协作集群',
        swarmGoal: '总目标',
        threadsTitle: '分工线程 (plan.json)',
        rosterTitle: '成员花名册',
        memberName: '成员',
        memberModel: '模型',
        memberState: '状态',
        memberTask: '当前任务',
        boardTitle: '公告板消息流',
        noBoardMessages: '暂无公告板消息',
        subagentsTitle: '子代理调用树',
        noAgents: '该对话未包含 Swarm 集群或子代理。',
      },
      artifacts: {
        listTitle: '产物列表',
        requestFeedback: '等你审阅',
        empty: '该对话尚未生成 Artifact 产物文件。',
        selectPrompt: '从左侧选择一个产物文件以预览完整内容',
        loading: '正在加载产物内容…',
        loadError: '加载产物内容失败',
        truncatedNotice: '文件较大，仅展示前 512KB 内容。',
        updatedAt: '更新于',
        rawToggle: '源码',
        renderedToggle: '渲染',
        copyContent: '复制内容',
      },
      timeline: {
        empty: '暂无可展示的对话时间线记录。',
        roleUser: '用户',
        roleAssistant: 'Agent',
        roleError: '错误',
        roleSystem: '系统',
        expand: '展开全文',
        collapse: '收起',
        toolCalls: '工具调用',
        thinking: '思考摘要',
        stepIndex: (idx) => `Step #${idx}`,
      },
      loadingDetail: '正在加载对话详情…',
      errorDetail: '无法加载该对话详情',
    },
    time: {
      justNow: '刚刚',
      secondsAgo: (n) => `${n}秒前`,
      minutesAgo: (n) => `${n}分钟前`,
      hoursAgo: (n) => `${n}小时前`,
      daysAgo: (n) => `${n}天前`,
    },
    errors: {
      loadFailed: '无法连接到 Mission Board 本地服务',
      retry: '重试',
      updateFailed: '保存修改失败，已还原状态',
    },
  },
  en: {
    appName: 'Antigravity Mission Board',
    demoMode: 'Demo Mode',
    demoTooltip: 'Running with synthetic demo data — no private local conversations are read.',
    liveConnected: 'Live',
    liveConnecting: 'Connecting',
    liveDisconnected: 'Offline',
    lastSynced: 'Synced',
    refresh: 'Refresh (R)',
    searchPlaceholder: 'Search conversations, transcripts, tags, or commands…',
    searchTriggerPlaceholder: 'Search conversations or run a command…',
    searchShortcutHint: '⌘K',
    searchServerMatches: (n) => `${n} FTS match${n === 1 ? '' : 'es'}`,
    clearFilters: 'Clear filters',
    resetFilters: 'Reset filters',
    allWorkspaces: 'All workspaces',
    noWorkspace: 'No workspace',
    allTags: 'All tags',
    moreTags: (c) => `+${c} more`,
    searchTagsPlaceholder: 'Filter tags…',
    noMatchingTags: 'No matching tags',
    density: {
      label: 'Density',
      comfortable: 'Comfortable',
      compact: 'Compact',
    },
    kanbanSort: {
      label: 'Sort',
      smart: 'Smart',
      recent: 'Recent',
      priority: 'Priority',
      steps: 'Steps',
    },
    views: {
      kanban: 'Kanban',
      matrix: 'Matrix',
      swarm: 'Swarms',
    },
    notifications: {
      enable: 'Enable alerts',
      enabled: 'Alerts on',
      denied: 'Notification permission blocked',
      tooltip: 'Desktop notifications + subtle chime when an agent finishes, needs input, or errors',
      soundOn: 'Sound on',
      soundOff: 'Sound off',
    },
    notificationKinds: {
      run_finished: 'Run finished',
      needs_attention: 'Needs attention',
      needs_input: 'Waiting for input',
      error: 'Execution error',
      feedback_requested: 'Artifact review requested',
    },
    searchMatchFields: {
      title: 'Title',
      preview: 'Preview',
      transcript: 'Transcript',
      notes: 'Notes',
      tags: 'Tags',
      workspace: 'Workspace',
      project: 'Project',
    },
    settings: {
      title: 'Board Settings',
      staleAfterHours: 'Stale threshold',
      staleAfterHint: 'Idle non-running conversations older than this automatically move to Stale',
      pollIntervalMs: 'Poll interval (ms)',
      hoursUnit: 'hours',
      save: 'Save settings',
      saved: 'Saved',
      saving: 'Saving…',
      dataDir: 'Data directory',
      mode: 'Mode',
      shortcutsTitle: 'Keyboard Shortcuts',
      shortcutSearch: 'Command palette / Search',
      shortcutViews: 'Switch Kanban / Matrix / Swarms',
      shortcutClose: 'Close drawer / modal',
      desktopSection: 'Desktop App',
      desktopAutoStart: 'Launch at Login',
      desktopAlwaysOnTop: 'Widget Always on Top',
      desktopShowWidget: 'Show Floating Widget',
    },
    widget: {
      allClear: 'All clear',
      runningShort: (n) => `${n} running`,
      attentionShort: (n) => `${n} attention`,
      expandTooltip: 'Expand widget panel',
      collapseTooltip: 'Collapse to pill',
      openBoardTooltip: 'Open full Mission Board',
      openFullBoard: 'Open Full Board',
      pinTopTooltip: 'Keep widget always on top',
      tabFocus: 'Focus',
      tabOpen: 'Open',
      tabRunning: 'Running',
      tabAttention: 'Attention',
      tabSwarm: 'Swarm',
      tabArchived: 'Archived',
      tabAll: 'All',
      emptyFocus: 'All conversations are clear or archived',
      emptyTab: 'No conversations in this filter',
      markReadShort: 'Read',
      previewBadge: 'Widget Preview',
      presetS: 'S',
      presetM: 'M',
      presetL: 'L',
      presetSTitle: 'Small Pill (336×52)',
      presetMTitle: 'Medium Radar (390×600)',
      presetLTitle: 'Large Panorama (700×580)',
      shortError: 'Err',
      shortFeedback: 'Rev',
      shortDecision: 'Ask',
      shortUnread: 'New',
      shortDue: 'Due',
      shortFlagged: 'Flag',
      hoverHint: 'Hover to preview · Click to lock',
      restingTitle: 'Hover any conversation to inspect',
      restingHint: 'Click to lock & push forward · Right-click or drag to move lanes',
      closePreview: 'Dismiss preview (Esc)',
      dropToArchive: 'Drop to archive conversation',
      lockedLabel: 'Locked',
      unlockTooltip: 'Unlock to resume hover preview',
      latestOutput: 'Latest Output',
      feedbackArtifacts: 'Pending Review',
      pushTitle: 'Quick Push-Forward',
      pushPlaceholder: 'Type follow-up prompt, Enter to push…',
      pushButton: 'Push',
      quickPrompts: ['Continue', 'Summarize progress', 'Check & fix errors'],
      dispatchSuccessCli: 'Dispatched directly via agy CLI',
      dispatchHandoffFocused: 'Copied & focused Antigravity — press Ctrl+V + Enter to push',
      dispatchHandoffCopied: 'Prompt copied — switch to Antigravity & press Ctrl+V + Enter',
      dispatchFailed: 'Failed to dispatch prompt',
      detailShort: 'Detail',
      pushShort: 'Push',
      workingAgentsLabel: 'Working',
      minimizeTooltip: 'Minimize to tray',
      quitTooltip: 'Quit Mission Board',
      browserMinimizeNotice: 'In Desktop App, hides floating widget to System Tray',
      browserQuitNotice: 'In Desktop App, quits Mission Board completely',
    },
    moveMenu: {
      triggerTooltip: 'Move to lane / quick triage',
      moveTo: 'Move conversation to',
    },
    theme: {
      light: 'Light',
      dark: 'Dark',
      switchToLight: 'Switch to light theme',
      switchToDark: 'Switch to dark theme',
    },
    radar: {
      running: 'Running',
      attention: 'Needs Attention',
      swarmsAndAgents: 'Active Swarms / Agents',
      stale: 'Stale',
      tokensAndCache: 'Tokens / Cache Hit',
      cacheHit: 'cache hit',
      activeFilterHint: 'Click to filter',
      filterActive: 'Filtered',
      totalConversations: 'Total',
    },
    lanes: {
      running: 'Running',
      attention: 'Needs Attention',
      active: 'In Progress',
      stale: 'Stale',
      archived: 'Archived',
      runningDesc: 'Agent or subagent actively executing',
      attentionDesc: 'Unread completion, waiting for decision, error, or artifact review',
      activeDesc: 'Ongoing active work',
      staleDesc: 'Idle past threshold — follow up or archive',
      archivedDesc: 'Archived conversations',
      manualBadge: 'Manual lane',
      resetAutoLane: 'Reset to auto',
      dropHere: 'Drop to move here',
      emptyColumn: 'No conversations',
      expandArchived: 'Expand Archived',
      collapseArchived: 'Collapse Archived',
      markAllRead: 'Mark all read',
    },
    attentionReasons: {
      unread_update: 'Unread completion',
      marked_as_unread: 'Marked unread',
      needs_input: 'Needs decision',
      error: 'Error',
      request_feedback: 'Artifact review',
      follow_up_due: 'Follow-up due',
      manual_attention: 'Flagged',
    },
    priority: {
      label: 'Priority',
      none: 'None',
      p0: 'P0 Urgent',
      p1: 'P1 High',
      p2: 'P2 Normal',
      cycleTooltip: 'Cycle priority (P0 / P1 / P2 / None)',
    },
    card: {
      markReviewed: 'Mark reviewed',
      reviewed: 'Reviewed',
      pin: 'Pin',
      unpin: 'Unpin',
      steps: 'steps',
      swarm: 'Swarm',
      subagents: 'subagents',
      runningNow: 'Running',
      artifacts: 'artifacts',
      autoLabel: 'Auto',
      untitled: 'Untitled Conversation',
      followUpDue: 'Follow-up',
    },
    matrix: {
      groupBy: 'Group',
      groupNone: 'None',
      groupWorkspace: 'Workspace',
      groupTag: 'Tag',
      groupLane: 'Lane',
      sortBy: 'Sort',
      sortLastActive: 'Last active',
      sortAttention: 'Attention first',
      sortSteps: 'Most steps',
      sortTokens: 'Token usage',
      sortPriority: 'Priority',
      colConversation: 'Conversation / Focus',
      colLane: 'Lane',
      colWorkspace: 'Workspace & Tags',
      colProgress: 'Checklist',
      colAgents: 'Agents',
      colTokens: 'Tokens',
      colLastActive: 'Last Active',
      colActions: 'Actions',
      untagged: 'Untagged',
      empty: 'No conversations match the current filters',
      showingCount: (shown, total) => `Showing ${shown} of ${total} conversations`,
    },
    swarmView: {
      title: 'Swarm & Multi-Agent Clusters',
      subtitle: 'Dedicated overview of conversations running Swarms or nested subagents with live worker state and board feed.',
      emptyTitle: 'No Swarm or subagent clusters yet',
      emptyDesc: 'Conversations that coordinate Swarm workers or spawn subagents will appear here automatically.',
      goal: 'Cluster Goal',
      threads: 'Plan Threads',
      workers: 'Worker Roster',
      recentBoard: 'Recent Board Highlights',
      subagents: 'Nested Subagents',
      openDetail: 'Open Details',
      noPlanGoal: 'No plan.json goal recorded yet',
      statusWorking: 'Working',
      statusWaiting: 'Waiting',
      statusStopped: 'Stopped',
      statusKilled: 'Ended',
      activeClusters: 'Active Clusters',
      workingAgents: 'Working Agents',
      totalSubagents: 'Subagents',
      boardMessagesCount: (c) => `${c} board post${c === 1 ? '' : 's'}`,
    },
    commandPalette: {
      placeholder: 'Search conversations, transcripts, tags, or type a command…',
      empty: 'No matching conversations or commands',
      conversationsSection: 'Matching Conversations',
      recentSection: 'Recent & Needs Attention',
      commandsSection: 'Quick Commands',
      filterBoardBy: (q) => `Filter board by "${q}"`,
      clearBoardSearch: 'Clear active board search filter',
      navigateHint: 'Navigate',
      selectHint: 'Select',
      closeHint: 'Close',
      ftsSearching: 'Searching transcripts…',
      cmds: {
        kanban: 'Switch to Kanban View',
        matrix: 'Switch to Project Matrix View',
        swarm: 'Switch to Swarm Clusters View',
        toggleTheme: 'Toggle Light / Dark Theme',
        toggleLocale: 'Toggle Language (EN / 中文)',
        toggleDensity: 'Toggle Card Density (Comfortable / Compact)',
        toggleNotifications: 'Toggle Desktop Alerts',
        markAllRead: (count) => `Mark all ${count} Needs Attention reviewed`,
        refresh: 'Refresh Board Now',
        shortcuts: 'Show Keyboard Shortcuts (?)',
      },
    },
    shortcutsModal: {
      title: 'Keyboard Shortcuts',
      subtitle: 'Built for high-velocity multi-agent triage',
      buttonTooltip: 'Keyboard shortcuts (?)',
      groupNavigation: 'Navigation',
      groupTriage: 'Quick Actions',
      groupDrawer: 'Detail Drawer',
      openCommandPalette: 'Open Command Palette & full-text search',
      switchKanban: 'Switch to Kanban board',
      switchMatrix: 'Switch to Project Matrix table',
      switchSwarm: 'Switch to Swarm Clusters view',
      refreshBoard: 'Refresh board snapshot',
      openShortcuts: 'Open keyboard shortcuts cheatsheet',
      prevNextConversation: 'Navigate to previous / next conversation',
      closeOverlay: 'Close drawer, command palette, or modal',
    },
    toasts: {
      undo: 'Undo',
      movedToLane: (title, lane) => `Moved "${title}" to ${lane}`,
      resetAutoLane: (title) => `Reset "${title}" to auto lane`,
      markedReviewed: (title) => `Marked "${title}" as reviewed`,
      markedAllReviewed: (count) => `Marked ${count} attention conversation${count === 1 ? '' : 's'} reviewed`,
      undone: 'Reverted last action',
      pinned: (title) => `Pinned "${title}"`,
      unpinned: (title) => `Unpinned "${title}"`,
      prioritySet: (title, p) => `Set "${title}" priority to ${p}`,
      priorityCleared: (title) => `Cleared priority on "${title}"`,
      copiedId: 'Copied conversation ID',
      copiedPath: 'Copied workspace path',
      refreshed: 'Board refreshed',
    },
    drawer: {
      close: 'Close (Esc)',
      copyId: 'Copy conversation ID',
      copyPath: 'Copy workspace path',
      copied: 'Copied',
      laneControl: 'Board Lane',
      autoLaneNote: (laneName) => `Auto lane: ${laneName}`,
      followUpPanel: 'Personal Follow-up & Metadata',
      editFollowUp: 'Edit',
      doneEditing: 'Done',
      addFollowUpHint: 'Add tags, follow-up notes, or reminder date…',
      prevConversation: 'Previous conversation (←)',
      nextConversation: 'Next conversation (→)',
      tagsLabel: 'Custom Tags',
      tagsCount: (c) => `${c} ${c === 1 ? 'tag' : 'tags'}`,
      addTagPlaceholder: 'Type tag and press Enter…',
      addTagBtn: 'Add',
      suggestedTags: 'Existing tags',
      notesLabel: 'Follow-up Notes',
      notesPlaceholder: 'Capture key decisions, next steps, or reminders (autosaves)…',
      notesSaving: 'Saving…',
      notesSaved: 'Saved',
      followUpDateLabel: 'Follow-up Date',
      clearDate: 'Clear',
      tabs: {
        overview: 'Overview',
        agents: 'Swarm & Agents',
        artifacts: 'Artifacts',
        timeline: 'Timeline',
      },
      overview: {
        currentFocus: 'Current Focus',
        noFocus: 'No active focus reported',
        checklist: 'Step Checklist',
        noChecklist: 'No update_steps checklist recorded',
        tokenBreakdown: 'Token & Model Breakdown',
        inputTokens: 'Input',
        cacheReadTokens: 'Cache Read',
        outputTokens: 'Output',
        totalTokens: 'Total',
        cacheHitRate: 'Cache Hit Rate',
        modelsUsed: 'Models Used',
        noTokenData: 'No token usage recorded',
        latestPreview: 'Latest Summary Preview',
        metadata: 'Details',
        createdOrModified: 'Last Active',
        lastUserInput: 'Last User Input',
        lastReviewed: 'Last Reviewed',
        stepCount: 'Step Count',
        never: 'Never',
        lastErrorTitle: 'Latest Execution Error',
        pendingQuestionTitle: 'Pending Question for User',
        sideQuestionsTitle: 'Side Questions',
      },
      agents: {
        swarmTitle: 'Swarm Cluster',
        swarmGoal: 'Goal',
        threadsTitle: 'Threads (plan.json)',
        rosterTitle: 'Worker Roster',
        memberName: 'Member',
        memberModel: 'Model',
        memberState: 'State',
        memberTask: 'Current Task',
        boardTitle: 'Board Feed',
        noBoardMessages: 'No board messages recorded',
        subagentsTitle: 'Subagent Tree',
        noAgents: 'This conversation has no Swarm or subagents.',
      },
      artifacts: {
        listTitle: 'Artifacts',
        requestFeedback: 'Review requested',
        empty: 'No artifacts have been generated in this conversation yet.',
        selectPrompt: 'Select an artifact on the left to inspect its contents',
        loading: 'Loading artifact…',
        loadError: 'Failed to load artifact content',
        truncatedNotice: 'Large file truncated to 512KB.',
        updatedAt: 'Updated',
        rawToggle: 'Raw',
        renderedToggle: 'Rendered',
        copyContent: 'Copy',
      },
      timeline: {
        empty: 'No timeline turns available for this conversation.',
        roleUser: 'User',
        roleAssistant: 'Assistant',
        roleError: 'Error',
        roleSystem: 'System',
        expand: 'Show more',
        collapse: 'Show less',
        toolCalls: 'Tools',
        thinking: 'Thinking summary',
        stepIndex: (idx) => `Step #${idx}`,
      },
      loadingDetail: 'Loading conversation details…',
      errorDetail: 'Failed to load conversation details',
    },
    time: {
      justNow: 'just now',
      secondsAgo: (n) => `${n}s ago`,
      minutesAgo: (n) => `${n}m ago`,
      hoursAgo: (n) => `${n}h ago`,
      daysAgo: (n) => `${n}d ago`,
    },
    errors: {
      loadFailed: 'Could not reach local Mission Board server',
      retry: 'Retry',
      updateFailed: 'Failed to save change; reverted',
    },
  },
};

export function loadSavedLocale(): Locale {
  try {
    const stored = localStorage.getItem('agmb_locale');
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    // ignore
  }
  return 'zh';
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem('agmb_locale', locale);
  } catch {
    // ignore
  }
}
