// Intentionally vulnerable Java code for scanner validation.
// DO NOT deploy.

import java.sql.*;
import java.io.*;
import javax.xml.xpath.*;

public class VulnJava {

    // 16. JDBC SQL injection via string concat
    public ResultSet getUser(String userId) throws Exception {
        Statement stmt = conn.createStatement();
        return stmt.executeQuery("SELECT * FROM users WHERE id=" + userId);
    }

    // 17. Unsafe deserialization
    public Object readData(InputStream in) throws Exception {
        ObjectInputStream ois = new ObjectInputStream(in);
        return ois.readObject();
    }

    // 18. XPath injection via string concat
    public String findNode(String userId) throws Exception {
        XPath xpath = XPathFactory.newInstance().newXPath();
        return xpath.evaluate("//user[@id='" + userId + "']", doc);
    }

    // 19. Log injection — user input in logger
    public void logLogin(String username) {
        logger.info("Login attempt: " + request.getParameter("user"));
    }

    // 20. Spring CSRF disabled
    public void configure(HttpSecurity http) throws Exception {
        http.csrf().disable();
    }
}
