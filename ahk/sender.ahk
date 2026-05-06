#Requires AutoHotkey v2.0

; Uso: AutoHotkey64.exe sender.ahk <tecla>
; Teclas válidas: shift_d | right | enter | escape | slash | ctrl_a
;
; Enfoca la ventana de Chrome con Google Fotos y envía la tecla indicada.

if A_Args.Length < 1 {
    MsgBox("Uso: sender.ahk <tecla>`n`nTeclas: shift_d, right, enter, escape, slash, ctrl_a")
    ExitApp(1)
}

key := A_Args[1]

WIN_TITLE := "Google Fotos ahk_class Chrome_WidgetWin_1"

; Enfocar la ventana antes de enviar teclas
if !WinExist(WIN_TITLE) {
    MsgBox("No se encontró la ventana de Google Fotos.")
    ExitApp(2)
}

WinActivate(WIN_TITLE)
WinWaitActive(WIN_TITLE,, 3)  ; espera hasta 3s a que esté activa

; Pequeña pausa para que Chrome procese el foco
Sleep(150)

switch key {
    case "shift_d": Send("+d")
    case "right":   Send("{Right}")
    case "enter":   Send("{Enter}")
    case "escape":  Send("{Escape}")
    case "slash":   Send("/")
    case "ctrl_a":  Send("^a")
    case "type":
        if A_Args.Length < 2 {
            MsgBox("Falta el texto a escribir")
            ExitApp(3)
        }
        SendText(A_Args[2])  ; SendText no interpreta {}, +, ^ como especiales
    default:
        MsgBox("Tecla desconocida: " key)
        ExitApp(3)
}

ExitApp(0)
