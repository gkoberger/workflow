$.page('index', function() {
  $('.fork').click(function() {
    let name = prompt("What do you want to call this branch?");
    name = name.replace(/[^-_a-zA-Z]/g, '').toLowerCase();
    if (name) {
      window.location.href = `/create/${name}`;
    }
    return false;
  });

  $('.merge').click(function() {
    $('#diff').lightbox_me();
    return false;
  });
});
