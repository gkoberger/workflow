$.page("index", function () {
  $(".fork").click(function () {
    let name = prompt("What do you want to call this branch?");
    name = name.replace(/[^-_a-zA-Z0-9]/g, "").toLowerCase();
    if (name) {
      window.location.href = `/create/${name}`;
    }
    return false;
  });

  $(".merge").click(function () {
    $("#diff").lightbox_me();
    return false;
  });
  $(".history").click(function () {
    $("#history").lightbox_me();
    return false;
  });

  hljs.highlightAll();

  $(".advanced").click(() => {
    $(".advanced").hide();
    $(".repo").show();
  });

  $("#sortable").sortable({
    axis: "y",
    stop: saveSidebar,
  });

  $("#add").click(function () {
    var name = prompt("Name?");
    var $li = $("<li>", { text: name });
    $("#sortable").append($li);
    $("#sortable").sortable("refresh");

    saveSidebar();
  });

  function saveSidebar() {
    var pages = $.map(
      $("#sortable li:not(.ui-sortable-helper)"),
      function ($el) {
        return ` * [${$($el).text()}](/test)`;
      }
    );
    $("#sidebar-order").text(`Category\n${pages.join("\n")}`);
    $("#sidebar-save").attr("disabled", false);
  }
});
