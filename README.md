# 豆豆桌面宠物

一只住在桌面上的 Electron 小狗。豆豆可以在桌面上走动、奔跑、睡觉、显示状态，也可以通过 Anthropic API 用短句和主人说话。

## 开发

```powershell
npm install
npm start
```

## 检查

```powershell
npm run check
```

## 打包

```powershell
npm run dist
```

## 发布和自动更新

项目使用 `electron-updater` 和 GitHub Releases 自动更新。推送 `v*` 标签或手动触发 `.github/workflows/release.yml` 会构建 Windows 安装包并发布 Release。

```powershell
git tag v1.0.1
git push origin v1.0.1
```
