(function () {
  "use strict";

  var destinations = {
    academic: "cy5qLmhlZWZlckB0dWUubmw=",
    teaching: "cy5qLmhlZWZlckB0dWUubmw=",
    music: "c2pvcnNoZWVmZXJAbGl2ZS5ubA==",
    other: "cy5qLmhlZWZlckB0dWUubmw="
  };

  function decode(value) {
    try {
      return atob(value);
    } catch (error) {
      return "";
    }
  }

  function currentTopic() {
    var select = document.getElementById("contact-topic");
    return select && destinations[select.value] ? select.value : "academic";
  }

  function destinationAddress() {
    return decode(destinations[currentTopic()]);
  }

  function setStatus(message) {
    var status = document.getElementById("contact-status");
    if (status) {
      status.textContent = message;
    }
  }

  function initialiseTopicFromQuery() {
    var select = document.getElementById("contact-topic");
    if (!select) return;

    var requested = new URLSearchParams(window.location.search).get("topic");
    if (requested && destinations[requested]) {
      select.value = requested;
    }
  }

  function buildMailto() {
    var form = document.getElementById("contact-form");
    if (!form) return "";

    var topicSelect = document.getElementById("contact-topic");
    var topicLabel = topicSelect.options[topicSelect.selectedIndex].text;
    var name = document.getElementById("contact-name").value.trim();
    var replyTo = document.getElementById("contact-email").value.trim();
    var subjectInput = document.getElementById("contact-subject").value.trim();
    var message = document.getElementById("contact-message").value.trim();
    var honeypot = document.getElementById("contact-company").value.trim();

    if (honeypot) {
      return "";
    }

    var subject = subjectInput || topicLabel + " enquiry via sjorsheefer.com";
    var body = [
      "Name: " + name,
      "Reply-to: " + replyTo,
      "Topic: " + topicLabel,
      "",
      message
    ].join("\n");

    return "mailto:" + destinationAddress() +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  }

  document.addEventListener("DOMContentLoaded", function () {
    initialiseTopicFromQuery();

    var form = document.getElementById("contact-form");
    var copyButton = document.getElementById("copy-address");

    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();

        if (!form.reportValidity()) {
          return;
        }

        var mailto = buildMailto();
        if (!mailto) {
          setStatus("Unable to prepare the message.");
          return;
        }

        setStatus("Opening your email app with a prefilled message…");
        window.location.href = mailto;
      });
    }

    if (copyButton) {
      copyButton.addEventListener("click", function () {
        var address = destinationAddress();
        if (!address || !navigator.clipboard) {
          setStatus("Copying is not supported in this browser. Use the email button instead.");
          return;
        }

        navigator.clipboard.writeText(address).then(function () {
          setStatus("Email address copied. You can paste it into your preferred webmail service.");
        }).catch(function () {
          setStatus("The browser blocked clipboard access. Use the email button instead.");
        });
      });
    }
  });
})();
