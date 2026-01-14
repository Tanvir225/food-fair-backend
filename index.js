const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();


/* =========================
   MIDDLEWARE
========================= */

app.use(cors(
    {
        origin: [
            "http://localhost:5173",
        ],
        credentials: true,
    }
));
app.use(express.json());
app.use(cookieParser());

//custom middleware to verify jwt token
const verifyToken = async (req, res, next) => {
    //token from cookie
    const token = req?.cookies?.token;
    // console.log(token);
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }

    //verify token
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    });
};



app.get("/", (req, res) => {
    res.send("Welcome to food-fair System");
});


/* =========================
   MongoDB Connection
========================= */


const uri = process.env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        // Get the database and collection on which to run the operation
        const database = client.db("foof-fair");
        const items = database.collection("items");
        const sales = database.collection("sales");
        const costs = database.collection("costs");
        const places = database.collection("places");


        //jwt token api ------------------------------
        app.post('/api/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365d' });


            res.cookie("token", token, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                path: "/",
            });

            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
            res.send({ status: true });
        });


        //end jwt token api ------------------------------


        /* ================= Food Items ================= */
        // static items (10 items only)
        app.post("/api/items", async (req, res) => {
            const result = await items.insertOne(req.body);
            res.send(result);
        });

        app.get("/api/items", async (req, res) => {
            const foods = await items.find().toArray();
            res.send(foods);
        });

        /* ============================================ */


        /* ================= Sales ================= */
        app.post("/api/sales", async (req, res) => {
            const { foodId, foodName, place, quantity, unitPrice, total } = req.body;

            const sale = {
                foodId,
                foodName,
                place,
                quantity,
                unitPrice,
                total,
                date: new Date()
            };

            console.log(sale);
            const result = await sales.insertOne(sale);
            res.send(result);
        });

        app.get("/api/sales", async (req, res) => {
            const { place, from, to } = req.query;

            let query = {};

            if (place) query.place = place;

            if (from && to) {
                query.date = {
                    $gte: new Date(from),
                    $lte: new Date(to)
                };
            }

            const salesCollection = await sales.find(query).sort({ date: -1 }).toArray();
            res.send(salesCollection);
        });

        /* ============================================ */

        /* ================= Costs ================= */
        app.post("/api/costs", async (req, res) => {
            const cost = {
                place: req.body.place,
                type: req.body.type, // food | transport | rent | helper | misc
                amount: Number(req.body.amount),
                date: new Date(req.body.date)
            };

            console.log(cost);

            const result = await costs.insertOne(cost);
            res.send(result);
        });

        app.get("/api/costs", async (req, res) => {
            const { place, from, to } = req.query;

            let query = {};

            if (place) query.place = place;

            if (from && to) {
                query.date = {
                    $gte: new Date(from),
                    $lte: new Date(to)
                };
            }

            const costsCollection = await costs.find(query).sort({ date: -1 }).toArray();
            res.send(costsCollection);
        });
        /* ============================================ */

        app.get("/api/report", async (req, res) => {
            const { place, from, to } = req.query;
            console.log(place, from, to);

            let match = {};
            if (place) match.place = place;
            if (from && to) {
                match.date = {
                    $gte: new Date(from),
                    $lte: new Date(to),
                };
            }

            const salesAgg = await sales.aggregate([
                { $match: match },
                { $group: { _id: null, totalSales: { $sum: "$total" } } },
            ]).toArray();

            const costAgg = await costs.aggregate([
                { $match: match },
                { $group: { _id: null, totalCost: { $sum: "$amount" } } },
            ]).toArray();

            const totalSales = salesAgg[0]?.totalSales || 0;
            const totalCost = costAgg[0]?.totalCost || 0;

            res.send({
                totalSales,
                totalCost,
                profit: totalSales - totalCost,
            });
        });

        /* ============================================ */


        // GET all places
        app.get("/api/places", async (req, res) => {
            try {
                const placesCollection = await places.find({})
                    .sort({ name: 1 })
                    .toArray();

                res.send(placesCollection);
            } catch (err) {
                console.error("❌ Fetch places error:", err);
                res.status(500).send({ message: "Failed to load places" });
            }
        });

        // POST new place
        app.post("/api/places", async (req, res) => {
            try {
                const place = {
                    name: req.body.name,
                    createdAt: new Date(),
                };

                const exists = await places.findOne({ name: place.name });
                if (exists) {
                    return res.status(409).send({ message: "Place already exists" });
                }
                console.log(place);

                const result = await places.insertOne(place);
                res.send({ success: true, insertedId: result.insertedId });
            } catch (err) {
                console.error("❌ Add place error:", err);
                res.status(500).send({ message: "Failed to add place" });
            }
        });



    }
    finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }

}
run().catch(console.dir);


/* =========================
   SERVER START
========================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});