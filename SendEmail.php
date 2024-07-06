<?php
 ini_set('display_errors', '1');
// functie spamcheck
function spamcheck($field)
  {
  //filter_var() sanitizes de email 
  $field=filter_var($field, FILTER_SANITIZE_EMAIL);
 
  //filter_var() valideert de email
  if(filter_var($field, FILTER_VALIDATE_EMAIL))
    {
    return true;
    }
  else
    {
    return false;
    }
  }
 
if($_SERVER['REQUEST_METHOD'] == 'POST') 
{  
 
 
// PHP mailer settings instellen voor GMAIL
require("c:\php\includes\class.phpmailer.php");  // het pad vanaf dit fomulier naar "class.phpmailer.php"
 
$mail = new PHPMailer(true);
 $mail->SetLanguage("en",dirname(__FILE__) . "/phpmailer/language/");
$mail->CharSet = 'utf-8'; //character set utf-8 
 
$mail->IsSMTP();  // smtp protocol gebruiken voor de email te verzenden 
 
$mail->Host = "smtp.gmail.com"; // smtp servernaam van gmail
 
$mail->Port = "465";  // smtp poort voor gmail
 
$mail->SMTPSecure = "ssl"; //gmail authenticeert door ssl ( andere optie is tls )
 
$mail->SMTPAuth = true; 
 
// account gegevens voor authenticatie Gmailserver
$mail->Username = "sjorsheefer@gmail.com"; 
 
$mail->Password = "IaSIlp13";
 
 
$mail->From = $_POST['email']; 
 
$mail->FromName = $_POST['naam']; 
 
$mail->AddAddress("jouw@email.com", "Jouw Naam"); // emailadres ontvanger en de naam die in email verschijnt
 
$mail->Subject = "Contactformulier";
 
// variabelen voor de body en body email opmaken
$naam = $_POST['naam'];
$achternaam = $_POST['achternaam'];
$email = $_POST['email'];
$bericht = $_POST['bericht'];
 
// body opmaken
$body = "";
$body .= "Naam: ";
$body .= $naam;
$body .= "<br />";
$body .= "Achternaam: ";
$body .= $achternaam;
$body .= "<br />";    
$body .= "Email: ";
$body .= $email;
$body .= "<br />";
$body .= "Bericht: ";
$body .= $bericht;
$body .= "<br />";
 
 
$mail->WordWrap = 80; 
 
//$mail->MsgHTML($body, dirname(__FILE__), true); // genereren van bodybericht 

if(!$mail->Send())

{

   echo "Message could not be sent. <p>";

   echo "Mailer Error: " . $mail->ErrorInfo;

   exit;

}

 

echo "Thank you, your message has been sent!";
 
 
 
// check of submitter een robot is en of er geldige input is geleverd
$mailcheck = spamcheck($_POST['email']);
 
if($_POST['robot'] != "test_spambot") {
    die();				    
} 
//check of email geldig is
elseif ($mailcheck == false) {
    echo "Ongeldige input van emailadres";
}
else {
 
// email verzenden 
$formsent = $mail->Send(); 
 
// echo's als verzenden goed of fout is gegaan
if ($formsent){
  echo 'Uw bericht is successvol verstuurd!'; 
}
else{
  echo 'Sorry, maar er is iets misgegaan met het versturen van het formulier; probeer het later nog eens.'; 
    }
  }
 
} // eind request method
?>
 
<form action="" method="post" name="" id="">
  <input type="hidden" name="robot" value="test_spambot" /><br />
  Naam: <br />
  <input type="text" name="naam" /><br />
  Achternaam: <br />
  <input type="text" name="achternaam" /><br />
  Email: <br />
  <input type="text" name="email" /><br />
  Bericht: <br />
  <textarea name="bericht" /></textarea>
  <br /><br />
  <input type="reset" value="Reset" />
  <input type="submit" value="Verzenden" />
</form>