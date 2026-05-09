/**
 * Sandbox 模块权限系统分析报告
 * ================================
 *
 * ## 1. 模块基本信息
 * - **模块名称**: sandbox
 * - **主程序**: trae-sandbox.exe
 * - **DLL 依赖**:
 *   - `trae_sbox.dll`: 沙箱核心实现库
 *   - `sbox_sdk.dll`: 沙箱 SDK 库
 *   - `sbox_ipc.dll`: IPC 通信库（与 AI Agent 共享）
 *
 * ## 2. 权限矩阵配置位置
 * 配置位于 `product.json` > `iCubeApp` > `nativeAppConfig` > `autoRunConfig`
 *
 * ## 3. 文件系统权限 (sandboxRWList)
 *
 * ### 3.1 RW (读写) 目录列表
 * 默认允许读写的目录（约 100+ 个），主要包括：
 *
 * #### 系统临时目录
 * - `/tmp`, `/var/folders`
 * - `$TMPDIR`, `$TEMP%`
 * - `/private/var/tmp`
 * - `$USERPROFILE/AppData/Local/Temp`
 *
 * #### 缓存目录
 * - `~/Library/Caches`
 * - `~/.cache`, `$XDG_CACHE_HOME`
 * - `$LOCALAPPDATA/pip`, `$LOCALAPPDATA/npm-cache`
 * - `$LOCALAPPDATA/conda`, `$LOCALAPPDATA/uv`
 *
 * #### 开发工具目录
 * - `$GOPATH`, `~/go`, `~/.gvm`
 * - `~/.m2` (Maven)
 * - `~/.gradle` (Gradle)
 * - `~/.npm`, `~/.yarn`
 * - `~/.rustup`, `~/.cargo`
 * - `~/.pyenv`, `~/miniconda3`, `~/.conda`
 * - `~/.nvm`, `~/.fnm`, `~/.bun`
 * - `~/.cmake`, `~/.llvm`, `~/.bazel`
 * - `~/.dotnet`, `~/.nuget`
 * - `~/.dart-tool`, `~/.pub-cache`, `~/Library/flutter`
 * - `~/.android`, `~/Library/Developer/Xcode`
 * - `~/.asdf`, `~/.jenv`, `~/.gem`, `~/.rvm`, `~/.rbenv`
 * - `~/.sbt`, `~/.ivy2`, `~/.coursier`
 *
 * #### 工作区相关
 * - `$WORKSPACE_FOLDER/node_modules`
 * - `$WORKSPACE_FOLDER/.git`
 * - `%USERPROFILE%\\.vscode`
 * - `%APPDATA%`
 *
 * ### 3.2 RO (只读) 目录列表
 * - `$WORKSPACE_FOLDER/.vscode`: 工作区的 VS Code 配置
 * - `$WORKSPACE_FOLDER/.trae/mcp.json`: Trae MCP 配置文件
 *
 * ## 4. 命令黑名单 (commandDenyList)
 *
 * 默认禁止的危险命令：
 * ```json
 * [
 *   "rm -rf /",           // 强制删除根目录
 *   "dd if=",             // 磁盘写入操作
 *   "mkfs.",              // 文件系统格式化
 *   ":(){ :|:& };:"       // Fork 炸弹
 * ]
 * ```
 *
 * ## 5. 运行模式配置
 *
 * ### 5.1 命令执行模式
 * - `ideCommandMode`: "whitelist" (IDE 模式: 白名单)
 * - `soloCommandMode`: "whitelist" (SOLO 模式: 白名单)
 *
 * ### 5.2 版本控制
 * - `run_mode_version`: "v2"
 * - `windows_run_mode_version`: "v2"
 *
 * ## 6. 网络控制
 * 虽然在当前配置中未明确看到网络白名单，但根据文档提示：
 * - 存在网络控制功能 (`sandboxNetworkControlDocsUrl`)
 * - 可能通过其他配置项或运行时参数控制
 *
 * ## 7. 权限生效机制分析
 *
 * ### 7.1 配置加载流程
 * ```
 * 应用启动 → 读取 product.json → 解析 autoRunConfig
 *     ↓
 * 初始化沙箱进程 (trae-sandbox.exe)
 *     ↓
 * 将权限规则传递给沙箱 (通过 IPC 或命令行参数)
 *     ↓
 * AI Agent 执行命令时 → 检查权限 → 允许/拒绝
 * ```
 *
 * ### 7.2 权限检查逻辑（推测）
 * 1. **路径检查**: 命令操作的文件路径是否在 RWList 中？
 * 2. **命令检查**: 命令本身是否在黑名单中？
 * 3. **模式检查**: 当前模式是否允许该类型操作？
 * 4. **网络检查**: 是否允许访问目标地址？（如果启用）
 *
 * ## 8. 关键发现与定制建议
 *
 * ### 8.1 可定制的配置项
 * 1. ✅ **sandboxRWList**: 可添加/删除读写目录
 * 2. ✅ **sandboxROList**: 可修改只读目录
 * 3. ✅ **commandDenyList**: 可扩展命令黑名单
 * 4. ✅ **命令执行模式**: 可切换 whitelist/blacklist 模式
 *
 * ### 8.2 技术限制
 * 1. ⚠️ **需要重启应用**: 修改 product.json 后通常需要重启才能生效
 * 2. ⚠️ **运行时修改困难**: 沙箱进程启动后可能缓存了权限规则
 * 3. ⚠️ **平台差异**: Windows/macOS/Linux 的路径格式不同
 * 4. ⚠️ **安全性风险**: 过度放宽限制可能导致安全问题
 *
 * ### 8.3 推荐实现方案
 *
 * #### 方案 A: 修改 product.json (推荐用于永久配置)
 * - **优点**: 标准方式，支持性好
 * - **缺点**: 需要重启应用
 * - **适用场景**: 长期使用的自定义权限配置
 *
 * #### 方案 B: 运行时 Hook (高级)
 * - **优点**: 动态生效，无需重启
 * - **缺点**: 技术复杂度高，可能影响稳定性
 * - **适用场景**: 开发调试、临时权限调整
 *
 * #### 方案 C: 创建预设配置文件
 * - **优点**: 方便切换不同权限场景
 * - **缺点**: 需要额外的配置管理机制
 * - **适用场景**: 多项目、多环境切换
 */

export interface SandboxConfig {
  moduleName: string;
  executable: string;
  dllDependencies: string[];
  rwDirectories: string[];
  roDirectories: string[];
  commandDenyList: string[];
  commandMode: {
    ide: 'whitelist' | 'blacklist';
    solo: 'whitelist' | 'blacklist';
  };
  runModeVersion: string;
}

export const SandboxAnalysisResult: SandboxConfig = {
  moduleName: 'sandbox',
  executable: 'trae-sandbox.exe',
  dllDependencies: [
    'trae_sbox.dll',
    'sbox_sdk.dll',
    'sbox_ipc.dll'
  ],
  rwDirectories: [
    '/tmp', '/var/folders', '$TMPDIR', '~/Library/Caches', '~/.cache',
    '$XDG_CACHE_HOME', '~/.local/lib', '~/.local/bin', '~/.local/share',
    '$GOPATH', '~/go', '~/.gvm', '~/Library/Application Support/go',
    '~/.local/share/go', '$XDG_DATA_HOME/go', '~/.m2', '~/.gradle',
    '~/.sdkman', '~/miniconda3', '~/.conda', '~/.pyenv',
    '~/Library/Python', '~/.npm', '~/Library/pnpm', '~/.fnm',
    '~/.nvm', '~/.rustup', '~/.cargo', '~/.cmake', '~/.llvm',
    '~/.bazel', '~/.gitlog', '~/.docker', '~/Library/Logs',
    '/private/var/tmp', '~/fvm', '~/.swiftpm', '~/.android',
    '~/.oracle_jre_usage', '~/.dart-tool', '~/.pub-cache',
    '~/Library/flutter', '~/Library/Developer/Xcode', '~/.yarn',
    '~/.foundry', '~/.asdf', '~/.jenv', '~/.gem', '~/.rvm',
    '~/.rbenv', '~/.bundle', '~/.dotnet', '~/.nuget', '~/.sbt',
    '~/.ivy2', '~/.coursier', '~/.hawtjni',
    '~/.local/state/pnpm', '~/.local/state/fnm_multishells',
    '~/.webx', '~/.bun', '~/.bash_history', '$GOCACHE',
    '$LOCALAPPDATA/pip', '$APPDATA/go', '$LOCALAPPDATA/conda',
    '$LOCALAPPDATA/go-build', '$LOCALAPPDATA/uv', '$APPDATA/uv',
    '~/miniforge3', '$LOCALAPPDATA/npm-cache', '$LOCALAPPDATA/pnpm',
    '$LOCALAPPDATA/Yarn', '$LOCALAPPDATA/fnm_multishells',
    '$LOCALAPPDATA/Microsoft/VSApplicationInsights',
    '$LOCALAPPDATA/Microsoft/Windows/INetCache',
    '$PROGRAMDATA/Microsoft/NetFramework/BreadcrumbStore',
    '$LOCALAPPDATA/NuGet', '~/.templateengine', '~/.matplotlib',
    '$LOCALAPPDATA/Packages/PythonSoftwareFoundation.Python..asterisk..',
    '$PROGRAMFILES/WindowsApps/PythonSoftwareFoundation.Python..asterisk..',
    '$LOCALAPPDATA/Microsoft/PowerShell',
    '$LOCALAPPDATA/Microsoft/Windows/PowerShell',
    '$PATH_flutter_2', '$APPDATA/.dart-tool', '$APPDATA/.flutter',
    '$USERPROFILE/AppData/Local/Temp', '$USERPROFILE/AppData/LocalLow/Temp',
    '/opt/homebrew', '$WORKSPACE_FOLDER/node_modules',
    '$WORKSPACE_FOLDER/.git', '%USERPROFILE%\\.vscode', '%APPDATA%', '%TEMP%'
  ],
  roDirectories: [
    '$WORKSPACE_FOLDER/.vscode',
    '$WORKSPACE_FOLDER/.trae/mcp.json'
  ],
  commandDenyList: [
    'rm -rf /',
    'dd if=',
    'mkfs.',
    ':(){ :|:& };:'
  ],
  commandMode: {
    ide: 'whitelist',
    solo: 'whitelist'
  },
  runModeVersion: 'v2'
};
