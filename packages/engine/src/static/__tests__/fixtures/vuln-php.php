<?php
// Intentionally vulnerable PHP code for scanner validation.
// DO NOT deploy.

// 24. SQL injection via mysql_query with variable concat
$id = $_GET['id'];
$result = mysql_query("SELECT * FROM users WHERE id=" . $id);

// 25. Code execution via eval
$code = $_POST['code'];
eval($code);

// 26. File inclusion with variable path
$page = $_GET['page'];
include($page);

?>
