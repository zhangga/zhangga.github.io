---
title: SVN/Git 差异比对插件
date: 2021-10-17 11:06:49
tags:
  - 服务器
id: svn-git-diff
categories:
  - 笔记
---

## 安装环境

系统环境：Windows10、Office套件。公司电脑已默认安装。

必备软件：[TortoiseSVN](https://osdn.net/projects/tortoisesvn/storage/1.14.1/Application/TortoiseSVN-1.14.1.29085-x64-svn-1.14.1.msi/)或[TortoiseGit](https://tortoisegit.org/download/)。大部分人应该已安装。

## 安装说明

**方法一**、

下载bat文件到本地，鼠标右键点击，以管理员身份运行即可。

diff-xlsx-ssc.bat

👇👇👇👇👇

<!-- more -->

```bash
@echo off

CHCP 65001

:: 系统环境变量
set ENV_PATH=%PATH%
@echo ====current environment：
@echo %ENV_PATH%

:: 启用命令扩展
setlocal enabledelayedexpansion
set svnStr=SVN
set gitStr=Git
:: 调用这个方法，传入字符串ENV_PATH和要查找的字符串svnStr。lens是它的返回值
call :getSubIndex ENV_PATH svnStr lensSvn
if "%lensSvn%"=="" (
	echo "没有找到SVN"
	goto :notSetSVN
) else (
	echo "找到TortoiseSVN环境变量"
)

:: 替换svn的js文件
call :getLastIndex ENV_PATH lensSvn svnPath
set svnDiffPath="%svnPath%\Diff-Scripts\diff-xls.js"
echo %svnDiffPath%
call :writeJSFile svnDiffPath
echo "成功设置SVN"

:notSetSVN

call :getSubIndex ENV_PATH gitStr lensGit
if "%lensGit%"=="" (
	echo "没有找到Git"
) else (
	echo "找到TortoiseGit环境变量"
)

:: 替换git的js文件
call :getLastIndex ENV_PATH lensGit gitPath
set gitDiffPath="%gitPath%\Diff-Scripts\diff-xls.js"
echo %gitDiffPath%
call :writeJSFile gitDiffPath

echo "成功设置Git"

:notSetGit

pause

exit /b
:getLastIndex
setlocal enabledelayedexpansion
set /A len+=%2
set value=
:strLen_LoopIndex
	set /A num=len-1
	if not "!%1:~%num%,1!"=="" (
		if "!%1:~%num%,1!"==";" (
			echo "%value%"
			endlocal & set %3=%value%
		) else (
			set /A len=len-1
			set value=!%1:~%num%,1!%value%
			goto :strLen_LoopIndex
		)
	) else (
		endlocal & set %3=%value%
	)
exit /b

exit /b
:getSubIndex
setlocal enabledelayedexpansion
:strLen_Loop
    set /A len+=1
    set /A len1+=0
    set /A num=len-1
    ::判断传入第二个参数要查找的字符是否已经遍历到了结尾，如果结尾了就说明匹配到了
    if not "!%2:~%len1%!"=="" (
    ::判断第一个传入的字符串是否已经遍历到了结尾
    if not "!%1:~%num%!"=="" (
        if not "!%2:~%len1%!"=="" (
            if "!%1:~%num%,1!"=="!%2:~%len1%,1!" (
				set /A len1=len1+1
            ) else (
                set /A len1=0
            )
            goto :strLen_Loop
        ) else (
			endlocal & set %3=%num%
          )
        )
    ) else (
        endlocal & set %3=%num%
    )
exit /b

exit /b
:writeJSFile
setlocal enabledelayedexpansion

more +109 %~dp0\diff-xlsx-ssc.bat > !%1!
exit /b

:: js比对脚本



var objArgs = WScript.Arguments;
if (objArgs.length < 2)
{
    Abort("Usage: [CScript | WScript] diff-xls.js base.xls new.xls", "Invalid arguments");
}

var sBaseDoc = objArgs(0);
var sNewDoc = objArgs(1);

var objScript = new ActiveXObject("Scripting.FileSystemObject");

if (objScript.GetBaseName(sBaseDoc) === objScript.GetBaseName(sNewDoc))
{
    Abort("File '" + sBaseDoc + "' and '" + sNewDoc + "' is same file name.\nCannot compare the documents.", "Same file name");
}

if (!objScript.FileExists(sBaseDoc))
{
    Abort("File '" + sBaseDoc + "' does not exist.\nCannot compare the documents.", "File not found");
}

if (!objScript.FileExists(sNewDoc))
{
    Abort("File '" + sNewDoc + "' does not exist.\nCannot compare the documents.", "File not found");
}

sBaseDoc = objScript.GetAbsolutePathName(sBaseDoc);
sNewDoc = objScript.GetAbsolutePathName(sNewDoc);
var sTempFolder = objScript.GetSpecialFolder(2)
var sTempFile = "D:\\temp.txt"
objScript = null;

var fs = new ActiveXObject("Scripting.FileSystemObject");
var f = fs.CreateTextFile(sTempFile, 2, true)
f.WriteLine(sBaseDoc)
f.WriteLine(sNewDoc)
f.close()
fs = null
f = null

WScript
var objShell = new ActiveXObject("WScript.Shell");
objShell.run('"C:\\Program Files\\Microsoft Office\\root\\Client\\AppVLP.exe" "C:\\Program Files (x86)\\Microsoft Office\\Office16\\DCF\\SPREADSHEETCOMPARE.EXE" "D:\\temp.txt"', 0, true)
objShell = null

```

**方法二**、

1. 下载文件保存到本地磁盘D目录下：

   diff-xlsx-ssc.vbs

👇👇👇👇👇

```vbscript

Option Explicit

Dim objArgs
Set objArgs = WScript.Arguments

Dim num
num = objArgs.Count
If num < 2 Then
    MsgBox "Usage: [CScript | WScript] diff-xlsx.vbs base.xlsx new.xlsx", vbExclamation, "Invalid arguments"
    WScript.Quit 1
End If

Dim sBaseFile, sNewFile
sBaseFile = objArgs(0)
sNewFile = objArgs(1)
Set objArgs = Nothing

Dim objFileSystem
Set objFileSystem = CreateObject("Scripting.FileSystemObject")
If objFileSystem.FileExists(sBaseFile) = False Then
    MsgBox "File " + sBaseFile + " does not exist.  Cannot compare the files.", vbExclamation, "File not found"
    WScript.Quit 1
End If
If objFileSystem.FileExists(sNewFile) = False Then
    MsgBox "File " + sNewFile + " does not exist.  Cannot compare the files.", vbExclamation, "File not found"
    WScript.Quit 1
End If

'Compare file size
Dim fBaseFile, fNewFile, sTempFolder, sTempFile
Set fBaseFile = objFileSystem.GetFile(sBaseFile)
Set fNewFile = objFileSystem.GetFile(sNewFile)
sTempFolder = objFileSystem.GetSpecialFolder(2)
sTempFile = sTempFolder + "\temp.txt"
Set objFileSystem = Nothing

'Create temp.txt for save path of 2 xlsx files
Dim fs, f
Set fs = WScript.CreateObject("Scripting.FileSystemObject")
Set f = fs.CreateTextFile(sTempFile, 2, True)
f.WriteLine sBaseFile
f.WriteLine sNewFile
f.Close()
Set fs = Nothing
Set f = Nothing

'Compare files using SPREADSHEETCOMPARE.exe
Dim WshShell, result
Set WshShell = WScript.CreateObject("WScript.Shell")
'Old office version 2016?
'result = WshShell.Run("""C:\Program Files (x86)\Microsoft Office\Office16\DCF\SPREADSHEETCOMPARE.exe"" " & sTempFile, 0, True)
'Office 365
'Could be this result = WshShell.Run("""C:\Program Files\Microsoft Office\root\vfs\ProgramFilesX86\Microsoft Office\Office16\DCF\SPREADSHEETCOMPARE.EXE"" " & sTempFile, 0, True)
result = WshShell.Run("""C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Microsoft Office Tools\Spreadsheet Compare"" " & sTempFile, 0, True)
Set WshShell = Nothing

WScript.Quit

```



2. 找个空白地方鼠标右键 -> TortoiseSVN -> Settings -> Diff Viewer -> Advanced

   [![5YUreU.md.png](https://z3.ax1x.com/2021/10/17/5YUreU.md.png)](https://imgtu.com/i/5YUreU)

3. 修改.xlsx 的值为 `wscript.exe "D:\diff-xlsx-ssc.vbs" %base %mine //E:vbscript`

   [![5YUBLT.png](https://z3.ax1x.com/2021/10/17/5YUBLT.png)](https://imgtu.com/i/5YUBLT)

## 使用说明

和SVN/Git工具比对文件的操作一样：

> 鼠标右键点击文件 -> TortoiseSVN -> Show log
>
> 选择要比对差异的版本
>
> 右键点击要查看的excel文件 -> Show changes

比对结果如下图：

[![5YadtH.png](https://z3.ax1x.com/2021/10/17/5YadtH.png)](https://imgtu.com/i/5YadtH)

