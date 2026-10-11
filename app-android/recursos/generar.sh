#!/usr/bin/env bash
# Regenera los íconos, la pantalla de inicio y el ícono de la notificación de
# Android a partir de los SVG de esta carpeta y de los íconos de la app web.
# Necesita ImageMagick 7 (magick). Correr desde app-android/:  bash recursos/generar.sh
set -euo pipefail
R=android/app/src/main/res
for p in "mdpi 48 108 24" "hdpi 72 162 36" "xhdpi 96 216 48" "xxhdpi 144 324 72" "xxxhdpi 192 432 96"; do
  set -- $p
  magick -background none -density 384 recursos/frente.svg -resize ${3}x${3} $R/mipmap-$1/ic_launcher_foreground.png
  magick ../icono-512.png -resize ${2}x${2} $R/mipmap-$1/ic_launcher.png
  r=$(( $2 / 2 ))
  magick ../icono-maskable-512.png -resize ${2}x${2} \( -size ${2}x${2} xc:black -fill white -draw "circle $r,$r $r,0" \) \
    -alpha off -compose copy_opacity -composite $R/mipmap-$1/ic_launcher_round.png
  mkdir -p $R/drawable-$1
  magick -background none -density 384 recursos/notificacion.svg -resize ${4}x${4} $R/drawable-$1/ic_stat_aviso.png
done
for f in $R/drawable*/splash.png; do
  s=$(magick identify -format "%wx%h" "$f"); w=${s%x*}; h=${s#*x}; m=$(( w < h ? w : h ))
  magick -background '#1b2e1e' -density 384 recursos/splash.svg -resize ${m}x${m} -gravity center -extent ${w}x${h} "$f"
done
echo "Recursos de Android regenerados."
