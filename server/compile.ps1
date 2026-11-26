$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }
Set-Location $scriptDir

if (-not (Test-Path "$scriptDir\target\classes")) {
    New-Item -ItemType Directory -Force -Path "$scriptDir\target\classes" | Out-Null
}

$m2Jars = (Get-ChildItem -Path "$env:USERPROFILE\.m2\repository" -Recurse -Filter "*.jar" | Where-Object { $_.Name -notmatch "-sources\.jar$" -and $_.Name -notmatch "-javadoc\.jar$" } | Select-Object -ExpandProperty FullName) -join ";"
$classpath = "$scriptDir\target\classes;$m2Jars"

$javaFiles = Get-ChildItem -Path "$scriptDir\src\main\java" -Recurse -Filter "*.java" | Select-Object -ExpandProperty FullName

$cleanScriptDir = ($scriptDir -replace '\\', '/')
$cleanClasspath = ($classpath -replace '\\', '/')

$argsContent = @(
    "-cp",
    "`"$cleanClasspath`"",
    "-d",
    "`"$cleanScriptDir/target/classes`"",
    "-parameters"
) + ($javaFiles | ForEach-Object { "`"" + ($_ -replace '\\', '/') + "`"" })

[System.IO.File]::WriteAllLines("$scriptDir\javac_args.txt", $argsContent)

$javacPath = "javac"
if (Test-Path "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot\bin\javac.exe") {
    $javacPath = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot\bin\javac.exe"
}
& $javacPath "@$scriptDir\javac_args.txt"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Java compilation succeeded with 0 errors!"
} else {
    Write-Error "Java compilation failed with exit code $LASTEXITCODE"
}

