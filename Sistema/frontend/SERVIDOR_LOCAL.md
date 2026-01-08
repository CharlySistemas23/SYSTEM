# Cómo Usar un Servidor Local

## Problema
Cuando abres `index.html` directamente desde el explorador de archivos (`file:///`), el navegador bloquea las peticiones a Railway por CORS.

## Solución: Usar un Servidor Local

### Opción 1: Live Server (VS Code) - RECOMENDADO

1. **Instalar extensión:**
   - Abre VS Code
   - Ve a Extensiones (Ctrl+Shift+X)
   - Busca "Live Server"
   - Instala la extensión de Ritwick Dey

2. **Usar:**
   - Clic derecho en `index.html`
   - Selecciona "Open with Live Server"
   - Se abrirá en `http://localhost:5500`

### Opción 2: Python (si lo tienes instalado)

```bash
cd "C:\Users\Panda\OneDrive\Imágenes\Sistema HTML\Sistema\frontend"
python -m http.server 8000
```

Luego abre: `http://localhost:8000`

### Opción 3: Node.js (si lo tienes instalado)

```bash
cd "C:\Users\Panda\OneDrive\Imágenes\Sistema HTML\Sistema\frontend"
npx http-server -p 8000
```

Luego abre: `http://localhost:8000`

### Opción 4: Servidor HTTP Simple (PowerShell)

```powershell
cd "C:\Users\Panda\OneDrive\Imágenes\Sistema HTML\Sistema\frontend"
# PowerShell 5.1+
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8000/")
$listener.Start()
Write-Host "Servidor en http://localhost:8000"
while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    
    $localPath = $request.Url.AbsolutePath
    if ($localPath -eq "/") { $localPath = "/index.html" }
    $filePath = Join-Path $PWD $localPath.TrimStart('/')
    
    if (Test-Path $filePath) {
        $content = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $content.Length
        $response.OutputStream.Write($content, 0, $content.Length)
    } else {
        $response.StatusCode = 404
    }
    $response.Close()
}
```

## Después de usar el servidor local

1. Abre `http://localhost:8000` (o el puerto que uses)
2. El sistema debería conectarse a Railway sin problemas de CORS
3. Puedes hacer login normalmente

