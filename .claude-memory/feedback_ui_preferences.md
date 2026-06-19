---
name: feedback-ui-preferences
description: "Preferencias de UI, tono y forma de trabajo del usuario en el CRM CDES"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2c2cd3d6-236d-4a49-9dbb-9a46a7d2f7bd
---

**Las horas siempre en formato AM/PM, nunca 24h.**

Why: El usuario es de El Salvador y todo el equipo trabaja mentalmente en AM/PM. Cuando le mostré "14h", "18h" en las etiquetas del timeline pidió cambiarlo a "2PM", "6PM". Aplica también a tooltips ("2:30 PM · Llamada"), encabezados de heatmap, y rangos de franjas ("Tarde 2PM-6PM" en vez de "Tarde 14-18h"). Confirmado de nuevo 2026-06-18 al pedir el reloj del banner en formato 12h.

How to apply: Cualquier vez que renderices una hora en UI usar formato 12h con sufijo AM/PM. Hay helper `formatoHora12(h, m)` en Index.html.

---

**Tono sutil, sin imperativos agresivos.**

Why: Cuando el banner de urgencia nivel 3 decía "🚨 ¡Movete! Llevás X sin atender a nadie" pidió "cambialo por ALGO MÁS SUTIL" y quedó como "🔴 Hace bastante: X sin un cliente". La urgencia la transmite el color/animación (rojo + shake + pulse), no el wording. Esto aplica a todo lo dirigido al vendedor: la urgencia visual está OK pero el lenguaje debe ser informativo, no de mando.

How to apply: Si tengo que dar un aviso urgente o llamar la atención, usar color + animación + un texto descriptivo sin imperativos. "🔴 Hace bastante" > "¡Movete!". "⚠️ Atención: hace" > "¡Apuráte!". Excepción: subtítulos de tarjetas de acción ("Atendelos ya", "Buscalos") son OK porque son verbos de acción, no de reproche.

---

**Simetría entre KPIs/cockpits del mismo tipo.**

Why: Cuando hice el cockpit "MIS PUNTOS HOY" más prominente (fondo azul, borde grueso, anillo más grande) pero dejé "PUNTOS DEL MES" con su estilo viejo (`bg-white/5`, borde fino), el usuario lo notó al toque y mandó captura: "no está simétrico". La asimetría visual entre tiles del mismo nivel jerárquico se ve y molesta.

How to apply: Si modifico el estilo de un tile/card que forma parte de un grupo (header KPIs, tarjetas de clasificación, etc.), aplicar el mismo tratamiento a sus pares al mismo tiempo. Si solo uno tiene un badge o feature único, dejar el resto IDÉNTICO en estilo base y diferenciar SOLO por el feature único. Color temático es OK que difiera (HOY azul / MES morado), pero estructura, tamaño y peso visual deben coincidir.

---

**Prefiere tunear lo existente antes que reemplazarlo.**

Why: Cuando el beeswarm de la timeline se veía apilado le ofrecí 4 alternativas (bandas tipo Gantt, histograma, híbrido, seguir tuneando) — eligió "seguir tuneando". Solo cuando la opción nueva resuelve un problema MUY claro acepta reemplazo (como el split panel-admin de Rutas → Auditoría).

How to apply: Antes de proponer reemplazar una visualización o componente, intentá un par de iteraciones de ajuste (más altura, mejor algoritmo de packing, color más visible, etc.). Solo si claramente no escala, plantear alternativas con mockups.

---

**Quiere validar números antes de creer en una métrica nueva.**

Why: Cuando vio que LUIS_SAP tenía 7 interacciones en mayo en el cockpit, pidió validar el dato antes de tomarlo como bueno. La validación confirmó que el dato era correcto y que era el vendedor el que solo registró en una ventana de 2h del 02/05.

How to apply: Si introducís una métrica nueva o cambias cómo se calcula algo, ofrecé proactivamente un mecanismo de validación (función de diagnóstico que pueda ejecutar desde el editor, exportable a logs).

---

**Itera rápido y deploya directo cuando está conforme.**

Why: En la sesión del 2026-06-18 hicimos ~10 deploys a producción en una tarde (v116 → v123). El flujo es: hago cambios → push a /dev → muestro qué hice → "ok deployemoslo de una!!" → promuevo. No hace QA exhaustivo entre versiones, prefiere ver el cambio en producción y corregir si hay algo. Confía en el dev y producción siempre testeable porque el iframe se puede hard-refresh.

How to apply: No pedir confirmaciones largas para cada paso. Mostrar resultado, ofrecer deploy en una frase, esperar OK breve. Si pide ajuste de wording o color, aplicar y re-push. Cuando dice "guarda contexto" o "subilo a github" significa cierre de sesión: actualizar memorias y commitear.

---

**Cuando me pide hacer "lo manual" automatizado, usar workaround B.**

Why: Para aplicar la migración de puntos a CONFIG_PUNTOS dijo "lo del paso manual hazlo tu". Le dije que `clasp run` no funciona y opté por el workaround B (rama temporal en doGet + curl). Funcionó en ~1 minuto: agregar `if (e.parameter.run === 'X')` en doGet → clasp push → create-version → update-deployment a prod → curl al endpoint → revertir doGet → create-version → update-deployment a prod. Lo hace transparente para el usuario y la idempotencia de la función protege.

How to apply: Si necesito ejecutar una función backend ad-hoc y el usuario no quiere ir al editor, hacer el workaround B sobre el deployment de PRODUCCIÓN (dev requiere autenticación). Ventana de exposición ~30 seg, mitigada por usar un nombre de parámetro único poco adivinable. Asegurar que la función sea idempotente. SIEMPRE revertir el doGet en una nueva versión al final.
