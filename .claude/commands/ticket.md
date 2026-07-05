---
description: Выполнить тикет по конвейеру workflow.md (implementer → ревью → manual-test → PR)
argument-hint: "T-0XX | пусто = следующий доступный"
---
Выполни тикет $ARGUMENTS по конвейеру из docs/orchestration/workflow.md.
Пустой аргумент → выбери следующий доступный по deps из state/progress.json (меньший номер).

Не забудь: OVERRIDES сильнее тикета; docs/manual-tests/T-0XX.md обязателен ДО открытия PR;
после PR — статус awaiting_merge и СТОП с сообщением человеку: ссылка на PR + краткая
выжимка «как тестировать» (3-5 строк).
