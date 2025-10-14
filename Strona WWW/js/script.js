(function ($) {
    "use strict";

    $(document).ready(function(){

        jQuery(window).on('scroll', function() {
            if ($(this).scrollTop() > 100) {
                $('.top-header').addClass("affix");
            } else {
                $('.top-header').removeClass("affix");
            }
        });

        /*navigation mobile version for dropdown-btn*/

        if($('.main-header li.dropdown ul').length){
            $('.main-header li.dropdown').append('<div class="dropdown-btn"><span class="fa fa-angle-down"></span></div>');
            
            //Dropdown Button
            $('.main-header li.dropdown .dropdown-btn').on('click', function() {
                $(this).prev('ul').slideToggle(500);
            });
            
            
            //Disable dropdown parent link
            $('.navigation li.dropdown > a').on('click', function(e) {
                e.preventDefault();
            });
        }

        
         /*====================================
        // counter
        ======================================*/

          $('.counter').counterUp({
           delay: 10,
           time: 1000
          });

        /*====================================
        // testimonial-carousel
        ======================================*/


        $('.testimonial-carousel.owl-carousel').owlCarousel({
            loop: true,
            margin: 30,
            nav: false,
            dots: true,
            autoplay: true,
            autoplayHoverPause: true,
            responsive: {
                0:{
                    items:1
                },
                480:{
                    items:1
                },
                600:{
                    items:2
                },
                1000:{
                    items:2
                },
                1170:{
                    items:3
                }
            }
        });

        /*====================================
        // team-carousel
        ======================================*/


        $('.amplebiz-team-carousel').owlCarousel({
            loop: true,
            margin: 30,
            nav: true,
            dots: false,
            navText : [
              "<i class='fa fa-angle-left'></i>",
              "<i class='fa fa-angle-right'></i>"
              ],
            responsive: {
                0:{
                    items:1
                },
                480:{
                    items:2
                },
                600:{
                    items:2
                },
                1000:{
                    items:3
                },
                1170:{
                    items:4
                }
            }
        });

        

        /*====================================
        // happy clients
        ======================================*/

        $('.happy-clients').owlCarousel({
            items:5,
            loop:true,
            margin:20,
            dots:false,
            responsiveClass:true,
            responsive:{
                0:{
                    items:1,
                },
                480:{
                    items:3,
                },
                768:{
                    items:5,
                },

            },
            autoplay:true,
            autoplayTimeout:5000,
            autoplayHoverPause:true
        });


        /*====================================
        // video popup
        ======================================*/

        $('.video-popup').magnificPopup({
            type: 'iframe',
            removalDelay: 300,
            mainClass: 'mfp-fade'
        });


        /*====================================
        // Isotop Active
        ======================================*/    
                
        if ($.fn.isotope) {
            $(".isotop-active").isotope({
                filter: '*',
            });

            $('.project-nav ul li').on('click', function() {
                $(".project-nav ul li").removeClass("active");
                $(this).addClass("active");

                var selector = $(this).attr('data-filter');
                $(".isotop-active").isotope({
                    filter: selector,
                    animationOptions: {
                        duration: 750,
                        easing: 'easeInOutQuart',
                        queue: false,
                    }
                });
                return false;
            });
        }


        /*====================================
        // scroll top
        ======================================*/

        $(window).scroll(function() {
            if ($(this).scrollTop() > 100) {
                $('.scroll-top').fadeIn();
            } else {
                $('.scroll-top').fadeOut();
            }
        });

        //Click event to scroll to top
        $('.scroll-top').on('click',function() {
            $('html, body').animate({ scrollTop: 0 }, 900);
            return false;
        });
        
        /*=================================*/
        /* WOW */
        /*=================================*/
      
         new WOW().init();

    });
})(jQuery);

