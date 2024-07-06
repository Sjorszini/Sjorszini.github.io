<?php


if(isset($_POST["Submit"]))

{

require("c:\php\includes\class.phpmailer.php");

 

$mail = new PHPMailer();



$mail->SetLanguage("en",dirname(__FILE__) . "/phpmailer/language/");

// Customize the following 5 lines with your own information. //

////////////////////////////////////////////////////////////////

 

$toaddress = "sjorsheefer@live.nl";  //Change this to the email address you will be receiving your notices.

$mailhost = "smtp.live.com";  //Change this to your actual Domain name.

$fromaddress = 'sjorsheefer@live.nl'; //Change this to the email address you will use to send and authenticate with.

$frompwd = "IaS#Ilp13";  //Change this to the above email addresses password.

$subject = "PHP Contact Form";  //Change this to your own email message subject.

 

//////////////////////////////////////////

// DO NOT CHANGE ANYTHING PAST THIS LINE//

//////////////////////////////////////////

 

$fromname = $_POST["TName"];

$body = $_POST["TBody"] ;

$rplyto = $_POST["TEmail"];

$msgbody = $fromname . "<br>" . $rplyto . "<br>" . $body;

 

$mail->IsSMTP();

$mail->Host = $mailhost;

$mail->SMTPAuth = true;

$mail->Username = $fromaddress;

$mail->Password = $frompwd;

 

$mail->From = $fromaddress;

$mail->FromName = $fromname;

$mail->AddReplyTo($rplyto);

$mail->AddAddress($toaddress);

$mail->IsHTML(true);

$mail->Subject = $subject;

$mail->Body = $msgbody;

 

if(!$mail->Send())

{

   echo "Message could not be sent. <p>";

   echo "Mailer Error: " . $mail->ErrorInfo;

   exit;

}

 

echo "Thank you, your message has been sent!";

}

 

?>

 

<html><body>

<form name="SendEmail01" method="post">

<table border=0>

<tr>

        <td>Name:</td>

        <td><input type="text" name="TName" size="30"></td>

</tr>

<tr>

        <td>Email:</td>

        <td><input type="text" name="TEmail" size="30"></td>

</tr>

<tr>

        <td>Body:</td>

        <td><textarea rows="4" name="TBody" cols="30"></textarea></td>

</tr>

<tr>

        <td><input type="submit" name="Submit" value="Submit"></td>

</tr>

</table>

</form>

</body></html>