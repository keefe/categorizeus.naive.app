package us.categorize.naive.app;

import java.io.InputStream;
import java.util.Properties;

import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.servlet.DefaultServlet;
import org.eclipse.jetty.servlet.ServletContextHandler;
import org.eclipse.jetty.servlet.ServletHolder;
import org.glassfish.jersey.servlet.ServletContainer;

import us.categorize.Config;
import us.categorize.Configuration;
import us.categorize.model.User;
import us.categorize.naive.NaiveMessageStore;
import us.categorize.naive.NaiveUserStore;
import us.categorize.naive.api.NaiveAuthorizer;

public class NaiveApp {

	public static void main(String[] args) throws Exception{
		
		Properties properties = new Properties();
		InputStream input = NaiveApp.class.getResourceAsStream("/categorizeus.naive.properties");
		properties.load(input);
		
		Config config = Config.readRelativeConfig();
		Configuration.instance().setUserStore(new NaiveUserStore(config.getDatabaseConnection()));
		Configuration.instance().setMessageStore(new NaiveMessageStore(config.getDatabaseConnection(), Configuration.instance().getUserStore(), config.getFileBase()));
		Configuration.instance().setAuthorizer(new NaiveAuthorizer(Configuration.instance().getUserStore()));
		
		/*
		User user = new User();
		user.setUsername("youruser");
		user.setPasshash(NaiveUserStore.sha256hash(NaiveUserStore.sha256hash("yourpassword")));
		Configuration.instance().getUserStore().registerUser(user);
		*/
        Server server = new Server(8080);

        ServletContextHandler ctx = 
                new ServletContextHandler(ServletContextHandler.SESSIONS);
                
        ctx.setContextPath("/");
        String staticDir = properties.getProperty("STATIC_DIR");
        String fileBase = properties.getProperty("FILE_BASE");

        System.out.println("Serving static from " + staticDir);
        ctx.setResourceBase(staticDir);

        ServletHolder filesDir = new ServletHolder("files", DefaultServlet.class);
        filesDir.setInitParameter("resourceBase",fileBase);
        filesDir.setInitParameter("pathInfoOnly","true");
        filesDir.setInitParameter("dirAllowed","true");
        ctx.addServlet(filesDir, "/files/*");
        
        ServletHolder serHol = ctx.addServlet(ServletContainer.class, "/v1/*");
        serHol.setInitOrder(1);
        serHol.setInitParameter("jersey.config.server.provider.packages", 
                "us.categorize.server;us.categorize.naive.users.server");
        serHol.setInitParameter("jersey.config.server.provider.classnames", 
                "org.glassfish.jersey.media.multipart.MultiPartFeature");
        ctx.addServlet(DefaultServlet.class, "/");
        server.setHandler(ctx);
        try {
            server.start();
            server.join();
        } catch (Exception ex) {
           ex.printStackTrace();
        } finally {

            server.destroy();
        }
	}

}
