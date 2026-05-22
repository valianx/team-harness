#!/bin/bash
# notify-windows.sh — Claude Code hook → Windows toast notification
# Requires: powershell.exe (included in Windows)

PAYLOAD=$(cat)

LAST_MSG=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('last_assistant_message','')[:300])" 2>/dev/null)
CWD=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null)

PROJECT=$(basename "$CWD")
TITLE="Claude Code — ${PROJECT}"
BODY="${LAST_MSG:-Waiting for input}"

PS_TITLE=$(echo "$TITLE" | sed "s/'/''/g")
PS_BODY=$(echo "$BODY" | sed "s/'/''/g" | head -c 200)
AUMID='{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'

powershell.exe -NoProfile -Command "
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
  \$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
  \$xml.LoadXml('<toast><visual><binding template=\"ToastGeneric\"><text>$PS_TITLE</text><text>$PS_BODY</text></binding></visual></toast>')
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('$AUMID').Show([Windows.UI.Notifications.ToastNotification]::new(\$xml))
" 2>/dev/null
