package com.mototv

import com.mototv.server.Route
import com.mototv.server.RouteResolver
import org.junit.Assert.assertEquals
import org.junit.Test

class RouteResolverTest {
    // A raiz e /controle redirecionam para o index dentro da pasta: os HTMLs
    // referenciam os scripts por caminho relativo e só resolvem certo lá.
    // A raiz agora abre o MENU (escolha entre Moto e Sinuca), não o jogo direto.
    @Test fun raiz_leva_ao_menu() {
        assertEquals(Route.Redirect("/menu/index.html"), RouteResolver.resolve("/"))
        assertEquals(Route.Asset("menu/index.html"), RouteResolver.resolve("/menu/index.html"))
    }

    @Test fun controle_leva_ao_index_do_controle() {
        assertEquals(Route.Redirect("/controle/index.html"), RouteResolver.resolve("/controle"))
        assertEquals(Route.Redirect("/controle/index.html"), RouteResolver.resolve("/controle/"))
        assertEquals(
            Route.Asset("controle/index.html"),
            RouteResolver.resolve("/controle/index.html"),
        )
    }

    @Test fun config_tem_rota_propria() {
        assertEquals(Route.Config, RouteResolver.resolve("/config"))
    }

    @Test fun update_tem_rota_propria() {
        assertEquals(Route.Update, RouteResolver.resolve("/update"))
    }

    @Test fun ws_tem_rota_propria() {
        assertEquals(Route.Ws, RouteResolver.resolve("/ws"))
    }

    @Test fun asset_comum_vira_caminho_relativo() {
        assertEquals(Route.Asset("game/game.js"), RouteResolver.resolve("/game/game.js"))
        assertEquals(
            Route.Asset("vendor/three.module.js"),
            RouteResolver.resolve("/vendor/three.module.js"),
        )
    }

    @Test fun path_traversal_da_404() {
        // "../" cru (o servidor já entrega o path decodificado, então %2e%2e chega assim)
        assertEquals(Route.NotFound, RouteResolver.resolve("/../secret.txt"))
        assertEquals(Route.NotFound, RouteResolver.resolve("/game/../../secret.txt"))
        // qualquer ".." no caminho, mesmo sem barra
        assertEquals(Route.NotFound, RouteResolver.resolve("/game/x..y.js"))
    }
}
