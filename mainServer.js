let http = require("http");
let path = require("path");
let express = require("express"); 
let bodyParser = require("body-parser");
const bcrypt = require('bcrypt');
const passport = require('passport');
const flash = require('express-flash');
const session = require('express-session');
const locStgy = require('passport-local').Strategy;
const fileURLToPath = require('url');
const fetch = require('node-fetch');

process.stdin.setEncoding("utf8");

require('dotenv').config({path:'./.env'});

const { MongoClient, ServerApiVersion } = require('mongodb');
const { authenticate } = require('passport');
const { builtinModules } = require("module");

let app = express();



var rLine = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

let promptUser = function() {
    const myArgs = process.argv.slice(2);

    if (myArgs.length != 1) {
        console.log(`Invalid number of arguments: ${myArgs.length}`);
        process.exit(0);
    }

    portNumber = myArgs[0];
    console.log(`Web server is running at http://localhost:${portNumber}`);


    rLine.question("Type stop to shutdown the server: ", function(answer) {
        if (answer === "stop"){
            console.log("Shutting down the server");
            rLine.close();
            process.exit(0);
        } else {
            console.log(`Invalid command: ${answer}`);
            promptUser();
        }
    });
}

promptUser();

app.set("views", path.resolve(__dirname, "templates"));
app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({extended:false}));
app.use(express.static(__dirname + '/public'));

//app.use(bodyparser.urlencoded({extended:false}));
app.use(bodyParser.json());

app.use(flash());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}))

app.use(passport.initialize());
app.use(passport.session());

const userName = process.env.MONGO_DB_USERNAME;
const password = process.env.MONGO_DB_PASSWORD;

const databaseAndCollection = {db: process.env.MONGO_DB_NAME, collection: process.env.MONGO_COLLECTION};

// can change the uri based on connecting database
const uri = `mongodb+srv://${userName}:${password}@cluster0.knoak.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

app.get("/", notAuth, (request, response) => {
    response.render('login');
}); 

app.post("/", notAuth, passport.authenticate('local', {
    successRedirect: '/home',
    failureRedirect: '/',
    failureFlash: true
})); 

app.get("/register", notAuth, (request, response) => {
    let variables = {
        msg: ""
    }
    response.render('register', variables);
}); 


app.post("/register", notAuth, async (request, response) => {
    try {
        const {fName, lName, email, password, confirm} = request.body;

        await client.connect();

        // check if user already exists
        const user = await lookUpEmail(client, databaseAndCollection, email);

        let matchesConfirm = password === confirm;
        let correctLength = password.length >= 8;
        let containsUpper = false;
        let containsLower = false;

        const specialChars = /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
        let containsSpecial = specialChars.test(password);

        let containsNumber = (/\d/).test(password);

        for (let i = 0; i < password.length; i++) {
            let letter = password[i];
            if (letter.toUpperCase() === letter) {
                containsUpper = true;
            } else if (letter.toLowerCase() === letter) {
                containsLower = true;
            }
        }


        let validPassword = matchesConfirm && correctLength && containsUpper && containsLower && containsSpecial && containsNumber;
        
        if (user === undefined && validPassword) {
            const hashedPassword = await bcrypt.hash(password, 10);
            const hashedCPassword = await bcrypt.hash(confirm, 10);
                
            let entry = {id: Date.now().toString(), fName: fName, lName: lName, email: email, password: hashedPassword, confirm: hashedCPassword};
        
            await addUser(client, databaseAndCollection, entry);

            response.redirect('/');
        } else {
            if (user !== undefined) {
                variables = {
                    msg: "Account already exists"
                 }  
             } else if (!matchesConfirm) {
                variables = {
                    msg: "Confirmation password does not match"
                }
             } else {
                let str = "Your password needs to:<br>";
                str += "Include both lower and upper case characters<br>"
                str += "Include at least one number and symbol<br>"
                str += "Be at least 8 characters long<br>";
                variables = {
                    msg: str
                }
            }

            response.render('register', variables);  
         }
       
    } catch (e) {
        console.log(e);
        variables = {
            msg: ""
        }
        response.render('register', variables);
    } finally {
        await client.close();
    }

    
}); 

app.get("/home", checkAuth, (request, response) => {

    let variables = {
        url : postUrl + "/pokemonSearch"
    };
    //console.log('here');
    response.render("pokemon", variables);
});

app.get('/pokemonSearch/:name', checkAuth, (request, response) => {
    (async() => {
        const apiResponse = await fetch(`https://pokeapi.co/api/v2/pokemon/${request.params.name}`);
        if(apiResponse.ok){
        const myJson = await apiResponse.json();
        let abilities = "";
        myJson.abilities.forEach(ability => {
            abilities = abilities + ability.ability.name + "<br>";
        });
        let types = "";
        myJson.types.forEach(type => {
            types = types + type.type.name + "<br>";
        });
        let variables = {
            url : postUrl + "/pokemonSearch",
            name: myJson.name,
            imageFront : myJson.sprites.front_default,
            abilities: abilities,
            types: types,
            hp: myJson.stats[0].base_stat,
            attack: myJson.stats[1].base_stat,
            defense: myJson.stats[2].base_stat,
            spAttack: myJson.stats[3].base_stat,
            spDefense: myJson.stats[4].base_stat,
            speed: myJson.stats[5].base_stat
        }
        response.render("pokemonSearch", variables);
        } else {
        let variables = {
            url : postUrl + "/pokemonSearch"
        }
        response.render("pokemonSearchNotFound", variables);
        }
    
  })();
});

app.post("/pokemonSearch", checkAuth, (request, response) => {
    (async () => {
        //console.log(request.user);
        let searchedMon = request.body.pokemon.toLowerCase();
        const apiResponse = await fetch(`https://pokeapi.co/api/v2/pokemon/${searchedMon}`);
        if(apiResponse.ok){
        const myJson = await apiResponse.json();
        let abilities = "";
        myJson.abilities.forEach(ability => {
            abilities = abilities + ability.ability.name + "<br>";
        });
        let types = "";
        myJson.types.forEach(type => {
            types = types + type.type.name + "<br>";
        });
        let variables = {
            url : postUrl + "/pokemonSearch",
            name: myJson.name,
            imageFront : myJson.sprites.front_default,
            abilities: abilities,
            types: types,
            hp: myJson.stats[0].base_stat,
            attack: myJson.stats[1].base_stat,
            defense: myJson.stats[2].base_stat,
            spAttack: myJson.stats[3].base_stat,
            spDefense: myJson.stats[4].base_stat,
            speed: myJson.stats[5].base_stat
        }
        response.render("pokemonSearch", variables);
        } else {
        let variables = {
            url : postUrl + "/pokemonSearch"
        }
        response.render("pokemonSearchNotFound", variables);
        }
      
      
    })();
});

async function addUser(client, databaseAndCollection, newUser) {
    const result = await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).insertOne(newUser);
}

async function lookUpEmail(client, databaseAndCollection, userEmail) {
    let filter = {email: userEmail};
    const result = await client.db(databaseAndCollection.db)
                        .collection(databaseAndCollection.collection)
                        .findOne(filter);

   if (result) {
       return result;
   }  
}

async function lookUpId(client, databaseAndCollection, userId) {
    let filter = {id: userId};
    const result = await client.db(databaseAndCollection.db)
                        .collection(databaseAndCollection.collection)
                        .findOne(filter);

   if (result) {
       return result;
   }  
}

async function authUser(email, password, done) {
    try {
        await client.connect();
        let user = await lookUpEmail(client, databaseAndCollection, email);

        if (user) { 
            try {
                const userPassword = user.password;
                const correctPassword = await bcrypt.compare(password, userPassword); 
                if (correctPassword) {
                    return done(null, user);
                } else {
                    return done(null, false, { message: 'Username or password incorrect'});
                }
            } catch (e) {
                return done(e);
            }
        } else {
            return done(null, false, { message: 'Username or password incorrect'} );
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }

}

async function initializePassport(passport) {
    passport.use(new locStgy({ usernameField: 'email' }, authUser));
    passport.serializeUser(function(user, done) {
        return done(null, user.id);
    })
    passport.deserializeUser(async function(id, done) {
        try {
            await client.connect();
            const obj = await lookUpId(client, databaseAndCollection, id);
            return done(null, obj);
        } catch (e) {
            console.log(e);
        } finally {
            await client.close();
        }
    })
}

initializePassport(passport);

function notAuth(request, response, next) {
    if (request.isAuthenticated()) {
        // if in account, you need to log out first
        response.redirect('/home');
    } else {
        next();
    }
}

function checkAuth(request, response, next) {
    console.log("checking")
    if (request.isAuthenticated()) {
        //console.log(request.user.userEmail);
        return next();
    } else {
        response.redirect('/');
    }
}

let postUrl = `http://localhost:${portNumber}`;
http.createServer(app).listen(portNumber);