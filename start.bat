@echo off
setlocal
title 简历工作台 - 一键启动
cd /d "%~dp0"

echo.
echo  ============================================
echo    简历工作台  一键启动
echo  ============================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo  [错误] 没有找到 npm，请先安装 Node.js：https://nodejs.org
    echo  安装完成后重新双击本脚本即可。
    pause
    exit /b 1
)

netstat -ano | findstr ":4000" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo  检测到服务已经在 4000 端口运行，直接打开浏览器。
    start "" http://localhost:4000
    timeout /t 2 /nobreak >nul
    exit /b 0
)

if not exist node_modules (
    echo  首次启动：正在安装项目依赖，请耐心等待...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo  [错误] 依赖安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
)

echo  正在启动开发服务器（日志显示在“简历工作台服务”窗口中）...
echo  等待服务就绪后会自动打开浏览器，请稍候...
echo.
start "简历工作台服务" cmd /k "npm run dev"

set /a tries=0
:wait
timeout /t 1 /nobreak >nul
netstat -ano | findstr ":4000" | findstr "LISTENING" >nul
if not errorlevel 1 goto opened
set /a tries+=1
if %tries% lss 60 goto wait

echo  [提示] 60 秒内未检测到服务，请查看“简历工作台服务”窗口中的日志。
pause
exit /b 1

:opened
start "" http://localhost:4000
echo  已自动打开浏览器：http://localhost:4000
echo  服务窗口（标题为“简历工作台服务”）请勿关闭，关闭它即停止服务。
echo  本窗口现在可以关闭。
echo.
pause
