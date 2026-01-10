# Guía para Subir Cambios a GitHub

## Paso 1: Instalar Git (si no está instalado)

1. Descarga Git desde: https://git-scm.com/download/win
2. Instala Git siguiendo el asistente (usa las opciones por defecto)
3. Reinicia la terminal/PowerShell después de instalar

## Paso 2: Verificar que Git está instalado

Abre PowerShell o CMD y ejecuta:
```bash
git --version
```

## Paso 3: Configurar Git (solo la primera vez)

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu.email@ejemplo.com"
```

## Paso 4: Inicializar el repositorio Git

Navega a la carpeta del proyecto y ejecuta:

```bash
cd "C:\Users\Panda\OneDrive\Imágenes\Sistema HTML"
git init
```

## Paso 5: Ver los archivos modificados

### Ver todos los archivos que han cambiado:
```bash
git status
```

### Ver los cambios detallados en cada archivo:
```bash
git diff
```

### Ver solo los nombres de archivos modificados:
```bash
git status --short
```

### Ver cambios en un archivo específico:
```bash
git diff nombre_archivo.js
```

## Paso 6: Agregar archivos al staging

### Agregar todos los archivos modificados:
```bash
git add .
```

### Agregar archivos específicos:
```bash
git add js/jewelry_label_editor.js
git add js/pos.js
```

## Paso 7: Ver qué archivos están en staging

```bash
git status
```

Los archivos en verde están listos para commit.

## Paso 8: Crear un commit

```bash
git commit -m "Actualización del sistema con mejoras"
```

## Paso 9: Conectar con GitHub

### Si ya tienes un repositorio en GitHub:

```bash
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
```

### Si necesitas crear un nuevo repositorio:
1. Ve a https://github.com
2. Clic en "New repository"
3. Crea el repositorio (no inicialices con README si ya tienes archivos)
4. Copia la URL del repositorio
5. Ejecuta:
```bash
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
```

## Paso 10: Subir los cambios

```bash
git branch -M main
git push -u origin main
```

## Comandos útiles para ver cambios

### Ver historial de commits:
```bash
git log --oneline
```

### Ver diferencias entre commits:
```bash
git diff HEAD~1
```

### Ver estadísticas de cambios:
```bash
git diff --stat
```

### Ver cambios de forma más visual:
```bash
git diff --color-words
```

## Nota importante

Si ya tenías un repositorio Git antes y solo quieres ver los cambios:
```bash
git status
git diff
```

Estos comandos te mostrarán todos los archivos modificados y los cambios específicos.




