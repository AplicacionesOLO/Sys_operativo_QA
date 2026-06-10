import type { RouteObject } from 'react-router-dom';
import NotFound from '@/pages/NotFound';
import LoginPage from '@/pages/login/page';
import Home from '@/pages/home/page';
import AreasPage from '@/pages/areas/page';
import DistribucionPage from '@/pages/distribucion/page';
import InversionPage from '@/pages/inversion/page';
import CostosPage from '@/pages/costos/page';
import CostosOutboundPage from '@/pages/costos-outbound/page';
import CostosCrossdockingPage from '@/pages/costos-crossdocking/page';
import CostosInboundPage from '@/pages/costos-inbound/page';
import AlmacenPage from '@/pages/almacen/page';
import CostosEmbedPage from '@/pages/costos/embed-page';
import CotizacionesPage from '@/pages/cotizaciones/page';
import ManoObraPage from '@/pages/mano-obra/page';
import GastosVariosPage from '@/pages/gastos-varios/page';
import VolumenesPage from '@/pages/volumenes/page';
import VolDistribucionPage from '@/pages/vol-distribucion/page';
import ConfiguracionPage from '@/pages/configuracion/page';
import FactoresPage from '@/pages/factores/page';
import ProtectedRoute from '@/components/feature/ProtectedRoute';

const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/costos-embed', element: <CostosEmbedPage /> },
  { path: '/', element: <ProtectedRoute moduleKey="dashboard"><Home /></ProtectedRoute> },
  { path: '/areas', element: <ProtectedRoute moduleKey="areas"><AreasPage /></ProtectedRoute> },
  { path: '/distribucion', element: <ProtectedRoute moduleKey="distribucion"><DistribucionPage /></ProtectedRoute> },
  { path: '/inversion', element: <ProtectedRoute moduleKey="inversion"><InversionPage /></ProtectedRoute> },
  { path: '/costos', element: <ProtectedRoute moduleKey="costos"><CostosPage /></ProtectedRoute> },
  { path: '/costos-outbound', element: <ProtectedRoute moduleKey="costos"><CostosOutboundPage /></ProtectedRoute> },
  { path: '/costos-crossdocking', element: <ProtectedRoute moduleKey="costos"><CostosCrossdockingPage /></ProtectedRoute> },
  { path: '/costos-inbound', element: <ProtectedRoute moduleKey="costos"><CostosInboundPage /></ProtectedRoute> },
  { path: '/almacen', element: <ProtectedRoute moduleKey="costos"><AlmacenPage /></ProtectedRoute> },
  { path: '/cotizaciones', element: <ProtectedRoute moduleKey="costos"><CotizacionesPage /></ProtectedRoute> },
  { path: '/mano-obra', element: <ProtectedRoute moduleKey="mano-obra"><ManoObraPage /></ProtectedRoute> },
  { path: '/gastos-varios', element: <ProtectedRoute moduleKey="gastos-varios"><GastosVariosPage /></ProtectedRoute> },
  { path: '/volumenes', element: <ProtectedRoute moduleKey="volumenes"><VolumenesPage /></ProtectedRoute> },
  { path: '/vol-distribucion', element: <ProtectedRoute moduleKey="volumenes"><VolDistribucionPage /></ProtectedRoute> },
  { path: '/configuracion', element: <ProtectedRoute moduleKey="configuracion"><ConfiguracionPage /></ProtectedRoute> },
  { path: '/factores', element: <ProtectedRoute moduleKey="costos"><FactoresPage /></ProtectedRoute> },
  { path: '*', element: <NotFound /> },
];

export default routes;