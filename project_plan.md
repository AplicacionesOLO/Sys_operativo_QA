# Sistema de Costos de Operación

## 1. Descripción del Proyecto
Aplicación web de gestión de costos operativos que permite registrar gastos mensuales, calcularlos automáticamente, visualizar resúmenes, generar alertas de presupuesto excedido y exportar datos en CSV y PDF. Orientado a administradores de instalaciones o empresas con múltiples áreas físicas.

## 2. Estructura de Páginas
- `/` - Dashboard (Panel de resumen general)
- `/gastos` - Registro de gastos
- `/areas` - Catálogo de áreas (Áreas + Tipos de área)
- `/alertas` - Alertas de presupuesto
- `/exportar` - Exportación de datos

## 3. Funcionalidades Core
- [x] Layout principal con sidebar de navegación
- [x] Catálogo de Áreas (CRUD)
- [x] Catálogo de Tipos de Área (CRUD)
- [ ] Registro de gastos con categorías y fechas
- [ ] Cálculo automático de totales mensuales por área
- [ ] Panel de resumen con gráficas
- [ ] Alertas cuando el gasto supera el presupuesto asignado
- [ ] Exportación a CSV
- [ ] Exportación a PDF

## 4. Modelo de Datos

### TipoArea
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | Identificador único |
| nombre | string | Nombre del tipo (ej. Oficina, Almacén) |
| descripcion | string | Descripción breve |
| color | string | Color para identificación visual |

### Area
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | Identificador único |
| nombre | string | Nombre del área |
| tipoAreaId | string | Referencia al tipo de área |
| presupuestoMensual | number | Presupuesto mensual asignado |
| descripcion | string | Descripción del área |
| activo | boolean | Estado activo/inactivo |

### Gasto
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | Identificador único |
| areaId | string | Referencia al área |
| concepto | string | Descripción del gasto |
| monto | number | Monto del gasto |
| fecha | string | Fecha del gasto (YYYY-MM-DD) |
| categoria | string | Categoría (Mantenimiento, Servicios, etc.) |

## 5. Integraciones de Backend / Terceros
- Supabase: No conectado — se usa almacenamiento local (localStorage) para persistir datos
- Shopify: No aplica
- Stripe: No aplica

## 6. Plan de Fases de Desarrollo

### Fase 1: Layout + Catálogo de Áreas ✅
- Objetivo: Estructura base de la app y catálogo de áreas con tipos
- Entregable: Sidebar, página de catálogo de áreas con CRUD completo

### Fase 2: Registro de Gastos
- Objetivo: Formulario para registrar gastos vinculados a áreas
- Entregable: Página con tabla de gastos, filtros y alta de gastos

### Fase 3: Panel de Resumen + Cálculo Automático
- Objetivo: Dashboard con gráficas de gastos vs presupuesto por área
- Entregable: Página Dashboard con widgets y gráficas

### Fase 4: Alertas de Presupuesto
- Objetivo: Sistema de alertas automáticas cuando se excede el presupuesto
- Entregable: Página de alertas con historial y configuración

### Fase 5: Exportación de Datos
- Objetivo: Exportar reportes en CSV y PDF
- Entregable: Página de exportación con filtros y descarga

## 7. Módulo de Cotizaciones v2 — Arquitectura

### Modelo de datos (Supabase)

#### cotizacion_cabecera
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| cliente | text | Nombre del cliente |
| mes | int | 1–12 |
| anio | int | Año |
| version | int | Versión (1, 2, 3...) |
| estado | text | borrador / vigente / cerrada / historica |
| moneda | text | USD, COP, EUR... |
| total_general | numeric | Calculado y guardado |
| notas | text | Observaciones |
| created_at / updated_at | timestamptz | |
| created_by | uuid → auth.users | |

#### cotizacion_detalle
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| cabecera_id | uuid FK | |
| proceso / subproceso | text | |
| costo_base | numeric | Calculado desde costos_operacion |
| multiplicador_base | numeric | Multiplicador por fila |
| total_final | numeric | costo_base × multiplicador_base |
| orden | int | |
| costo_fila_id | uuid | Referencia a costos_operacion |

#### cotizacion_columnas_dinamicas
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| name / key | text | Nombre y clave única |
| data_type | text | number / percent / currency / text / formula |
| effect_type | text | add / subtract / multiply / display_only / formula |
| applies_to | text | all / process / subprocess |
| formula_expression | text nullable | |
| is_editable / is_visible / is_active | bool | |
| sort_order | int | |

#### cotizacion_valores_dinamicos
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| detalle_id | uuid FK | |
| columna_id | uuid FK | |
| raw_value | text | Valor ingresado |
| computed_value | numeric | Valor calculado |

### Fases de implementación

#### Fase A ✅ — Base de datos + UI principal
- Tablas creadas con RLS
- Sidebar con historial agrupado por cliente/período
- Tabla de detalles con columnas dinámicas
- Modal nueva cotización (cliente, mes, año, versión, moneda, estado)
- Modal duplicar cotización (copia detalles + valores dinámicos)
- Modal admin columnas dinámicas (CRUD)
- Vista comparativa entre períodos

#### Fase B — Motor de cálculo avanzado + exportación
- Motor de fórmulas para columnas dinámicas
- Exportación PDF con columnas dinámicas
- Exportación Excel

#### Fase C — Auditoría + historial de cambios
- Log de cambios por cotización
- Trazabilidad de versiones
